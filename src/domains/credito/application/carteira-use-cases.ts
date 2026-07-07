import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import {
  asaasCriarPix,
  asaasGarantirCliente,
  asaasStatusPagamento,
  getAsaasRuntime
} from "@/lib/asaas/asaas-service";

/**
 * CARTEIRA DE CRÉDITOS (pré-pago da plataforma) do tenant, em reais. Recarrega via Pix (Asaas —
 * conta da Valleteclab) e debita o preço de revenda a cada consulta de crédito. O saldo é da
 * plataforma, não é banco do tenant.
 */

export class CreditoError extends Error {}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Carteira do tenant (cria com saldo 0 na primeira vez). */
export async function getCarteira(scope: TenantScope) {
  const existente = await prisma.carteiraCredito.findUnique({ where: { tenantId: scope.tenantId } });
  if (existente) return existente;
  return prisma.carteiraCredito.create({ data: { tenantId: scope.tenantId, saldo: 0 } });
}

export async function saldoCarteira(scope: TenantScope): Promise<number> {
  const c = await getCarteira(scope);
  return Number(c.saldo);
}

/**
 * Debita o preço de uma consulta da carteira (dentro da transação da consulta). Lança se faltar
 * saldo — o chamador orienta o tenant a recarregar. NÃO credita nada; só desconta.
 */
export async function debitarCarteira(scope: TenantScope, valor: number, motivo: string, usuarioId?: string): Promise<number> {
  const custo = round2(valor);
  return prisma.$transaction(async (tx) => {
    const carteira = await tx.carteiraCredito.findUnique({ where: { tenantId: scope.tenantId } });
    const saldo = Number(carteira?.saldo ?? 0);
    if (saldo < custo) throw new CreditoError(`Saldo insuficiente na carteira (R$ ${saldo.toFixed(2)}). Recarregue para consultar (custo R$ ${custo.toFixed(2)}).`);
    const novo = round2(saldo - custo);
    await tx.carteiraCredito.update({ where: { tenantId: scope.tenantId }, data: { saldo: novo } });
    await createAuditLog(tx, { scope, usuarioId, entidade: "CarteiraCredito", entidadeId: scope.tenantId, acao: "DEBITO", payload: { valor: custo, motivo, saldo: novo } });
    return novo;
  });
}

/**
 * Cria uma RECARGA da carteira via Pix (Asaas). Devolve o QR (copia-e-cola + imagem) para o tenant
 * pagar; a confirmação (webhook) credita o saldo. Reaproveita o cliente Asaas do tenant.
 */
export async function criarRecarga(
  scope: TenantScope,
  input: { valor: number },
  usuarioId?: string
): Promise<{ id: string; valor: number; payload: string | null; qrBase64: string | null; expiraEm: string | null }> {
  const valor = round2(input.valor);
  if (!(valor >= 10)) throw new CreditoError("Valor mínimo de recarga: R$ 10,00.");
  const rt = await getAsaasRuntime();
  if (!rt) throw new CreditoError("Gateway de recarga (Asaas) não configurado pela plataforma.");

  const carteira = await getCarteira(scope);
  const tenant = await prisma.tenant.findUnique({ where: { id: scope.tenantId }, select: { nome: true } });
  const empresa = await prisma.empresa.findFirst({ where: { id: scope.empresaId, tenantId: scope.tenantId }, select: { cnpj: true, email: true, razaoSocial: true } });

  // Cliente Asaas do tenant (pagador) — reusa o mesmo nas próximas recargas.
  let customerId = carteira.asaasCustomerId;
  if (!customerId) {
    customerId = await asaasGarantirCliente(rt, {
      nome: tenant?.nome ?? empresa?.razaoSocial ?? "Cliente XERP",
      cpfCnpj: empresa?.cnpj ?? null,
      email: empresa?.email ?? null,
      externalReference: scope.tenantId
    });
    await prisma.carteiraCredito.update({ where: { tenantId: scope.tenantId }, data: { asaasCustomerId: customerId } });
  }

  const recarga = await prisma.recargaCredito.create({
    data: { tenantId: scope.tenantId, empresaId: scope.empresaId, valor, status: "PENDENTE", usuarioId: usuarioId ?? null }
  });

  const hoje = new Date().toISOString().slice(0, 10);
  const pix = await asaasCriarPix(rt, {
    customerId,
    valor,
    descricao: `Recarga de créditos de consulta — ${tenant?.nome ?? "XERP"}`,
    externalReference: recarga.id,
    vencimento: hoje
  });

  const atualizada = await prisma.recargaCredito.update({
    where: { id: recarga.id },
    data: {
      asaasPaymentId: pix.paymentId,
      pixPayload: pix.payload,
      pixQrBase64: pix.qrBase64,
      expiraEm: pix.expiraEm ? new Date(pix.expiraEm) : null
    }
  });

  return { id: atualizada.id, valor, payload: pix.payload, qrBase64: pix.qrBase64, expiraEm: pix.expiraEm };
}

/** Verifica o status da recarga no Asaas e credita a carteira se estiver paga (fallback do webhook). */
export async function sincronizarRecarga(scope: TenantScope, recargaId: string) {
  const recarga = await prisma.recargaCredito.findFirst({ where: { id: recargaId, tenantId: scope.tenantId } });
  if (!recarga) throw new CreditoError("Recarga não encontrada.");
  if (recarga.status === "CONFIRMADA") return { status: "CONFIRMADA", pago: true };
  if (!recarga.asaasPaymentId) return { status: recarga.status, pago: false };
  const rt = await getAsaasRuntime();
  if (!rt) return { status: recarga.status, pago: false };
  const status = await asaasStatusPagamento(rt, recarga.asaasPaymentId);
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(status)) {
    await confirmarRecargaPorPagamento(recarga.asaasPaymentId);
    return { status: "CONFIRMADA", pago: true };
  }
  return { status, pago: false };
}

/**
 * Credita a carteira ao confirmar o pagamento de uma recarga (idempotente por asaasPaymentId).
 * Chamado pelo WEBHOOK do Asaas e pelo fallback de sincronização.
 */
export async function confirmarRecargaPorPagamento(asaasPaymentId: string): Promise<{ creditado: boolean }> {
  return prisma.$transaction(async (tx) => {
    const recarga = await tx.recargaCredito.findUnique({ where: { asaasPaymentId } });
    if (!recarga) return { creditado: false };
    if (recarga.status === "CONFIRMADA") return { creditado: false }; // idempotente
    await tx.recargaCredito.update({ where: { id: recarga.id }, data: { status: "CONFIRMADA", pagoEm: new Date() } });
    const carteira = await tx.carteiraCredito.upsert({
      where: { tenantId: recarga.tenantId },
      update: {},
      create: { tenantId: recarga.tenantId, saldo: 0 }
    });
    const novo = round2(Number(carteira.saldo) + Number(recarga.valor));
    await tx.carteiraCredito.update({ where: { tenantId: recarga.tenantId }, data: { saldo: novo } });
    await createAuditLog(tx, {
      // empresaId da Auditoria é nullable; o webhook pode não ter empresa no escopo.
      scope: { tenantId: recarga.tenantId, empresaId: (recarga.empresaId ?? null) as unknown as string },
      entidade: "CarteiraCredito",
      entidadeId: recarga.tenantId,
      acao: "RECARGA_CONFIRMADA",
      payload: { recargaId: recarga.id, valor: Number(recarga.valor), saldo: novo }
    });
    return { creditado: true };
  });
}

/**
 * CORTESIA: o dono do SaaS credita créditos de consulta na carteira de um tenant SEM Pix (bônus,
 * plano incluso, teste). Registra como recarga CONFIRMADA (aparece no histórico do tenant) + auditoria.
 */
export async function liberarCreditosCortesia(
  tenantId: string,
  valor: number,
  motivo: string,
  usuarioId?: string
): Promise<{ saldo: number }> {
  const v = round2(valor);
  if (!(v > 0)) throw new CreditoError("Informe um valor maior que zero.");
  return prisma.$transaction(async (tx) => {
    const carteira = await tx.carteiraCredito.upsert({ where: { tenantId }, update: {}, create: { tenantId, saldo: 0 } });
    const novo = round2(Number(carteira.saldo) + v);
    await tx.carteiraCredito.update({ where: { tenantId }, data: { saldo: novo } });
    // Recarga CONFIRMADA sem asaasPaymentId = cortesia (transparente no histórico do tenant).
    await tx.recargaCredito.create({ data: { tenantId, valor: v, status: "CONFIRMADA", pagoEm: new Date(), usuarioId: usuarioId ?? null } });
    await createAuditLog(tx, {
      scope: { tenantId, empresaId: (null as unknown as string) },
      usuarioId, entidade: "CarteiraCredito", entidadeId: tenantId, acao: "CORTESIA",
      payload: { valor: v, motivo, saldo: novo }
    });
    return { saldo: novo };
  });
}

/** Histórico de recargas do tenant. */
export async function listarRecargas(scope: TenantScope, limite = 20) {
  return prisma.recargaCredito.findMany({
    where: { tenantId: scope.tenantId },
    orderBy: { criadoEm: "desc" },
    take: limite,
    select: { id: true, valor: true, status: true, criadoEm: true, pagoEm: true }
  });
}

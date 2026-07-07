import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";

/**
 * VENDA FATURADA (boleto/crediário) — liberação por cliente. Só o perfil FINANCEIRO libera; sem
 * isso, o caixa/PDV/confirmação bloqueia a venda a prazo e orienta a solicitar liberação.
 */

/** Erro específico do gate — o front detecta pelo code para mostrar o fluxo de liberação. */
export class VendaFaturadaBloqueadaError extends Error {
  code = "VENDA_FATURADA_BLOQUEADA" as const;
  constructor(public clienteId: string, public clienteNome: string) {
    super(`Cliente "${clienteNome}" não está liberado para venda faturada (boleto/crediário). Solicite a liberação ao financeiro.`);
  }
}

/** GATE: garante que o cliente está liberado para venda faturada. Lança se não estiver. */
export async function assertVendaFaturadaLiberada(scope: TenantScope, clienteId: string): Promise<void> {
  const cliente = await prisma.cliente.findFirst({
    where: { id: clienteId, ...scopedByTenantCompany(scope) },
    select: { vendaFaturadaLiberada: true, razaoSocial: true, nomeFantasia: true }
  });
  if (!cliente) return; // cliente inexistente é tratado por outras validações
  if (!cliente.vendaFaturadaLiberada) {
    throw new VendaFaturadaBloqueadaError(clienteId, cliente.nomeFantasia ?? cliente.razaoSocial);
  }
}

/** Status de liberação de um cliente (para o cadastro e a tela de venda). */
export async function statusVendaFaturada(scope: TenantScope, clienteId: string) {
  const cliente = await prisma.cliente.findFirst({
    where: { id: clienteId, ...scopedByTenantCompany(scope) },
    select: { vendaFaturadaLiberada: true, vendaFaturadaLiberadaPor: true, vendaFaturadaLiberadaEm: true, vendaFaturadaObs: true, limiteCredito: true }
  });
  if (!cliente) return null;
  let liberadaPorNome: string | null = null;
  if (cliente.vendaFaturadaLiberadaPor) {
    const u = await prisma.usuario.findUnique({ where: { id: cliente.vendaFaturadaLiberadaPor }, select: { nome: true } });
    liberadaPorNome = u?.nome ?? null;
  }
  return {
    liberada: cliente.vendaFaturadaLiberada,
    por: liberadaPorNome,
    em: cliente.vendaFaturadaLiberadaEm?.toISOString() ?? null,
    obs: cliente.vendaFaturadaObs,
    limiteCredito: Number(cliente.limiteCredito)
  };
}

/**
 * LIBERA (ou revoga) a venda faturada de um cliente. A permissão FINANCEIRO é validada na rota.
 * Pode ajustar o limite de crédito junto (o financeiro avalia e define de uma vez).
 */
export async function definirVendaFaturada(
  scope: TenantScope,
  clienteId: string,
  input: { liberada: boolean; obs?: string | null; limiteCredito?: number | null },
  usuarioId?: string
): Promise<{ liberada: boolean }> {
  const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, ...scopedByTenantCompany(scope) }, select: { id: true } });
  if (!cliente) throw new Error("Cliente não encontrado.");
  await prisma.$transaction(async (tx) => {
    await tx.cliente.update({
      where: { id: clienteId },
      data: {
        vendaFaturadaLiberada: input.liberada,
        vendaFaturadaLiberadaPor: input.liberada ? (usuarioId ?? null) : null,
        vendaFaturadaLiberadaEm: input.liberada ? new Date() : null,
        vendaFaturadaObs: input.obs ?? undefined,
        ...(input.limiteCredito != null ? { limiteCredito: input.limiteCredito } : {})
      }
    });
    await createAuditLog(tx, {
      scope, usuarioId, entidade: "Cliente", entidadeId: clienteId,
      acao: input.liberada ? "VENDA_FATURADA_LIBERADA" : "VENDA_FATURADA_REVOGADA",
      payload: { obs: input.obs ?? null, limiteCredito: input.limiteCredito ?? null }
    });
  });
  return { liberada: input.liberada };
}

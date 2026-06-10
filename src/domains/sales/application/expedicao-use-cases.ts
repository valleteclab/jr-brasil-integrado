import { randomInt } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";

/**
 * Expedição (balcão de retirada): o caixa emite um recibo com código curto junto da nota;
 * o cliente apresenta o recibo na expedição, o conferente digita/escaneia o código,
 * confere os itens e confirma a entrega (pedido vira ENTREGUE).
 *
 * Módulo liberado POR TENANT pelo dono do SaaS (Tenant.expedicaoHabilitada) — lojas de
 * material de construção/autopeças usam; as demais nem veem o recurso.
 */

export class ExpedicaoError extends Error {}

// Sem 0/O/1/I/L para o conferente não errar na digitação.
const ALFABETO_CODIGO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const TAMANHO_CODIGO = 6;

function gerarCodigo(): string {
  let codigo = "";
  for (let i = 0; i < TAMANHO_CODIGO; i++) codigo += ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)];
  return codigo;
}

function normalizarCodigo(codigo: string): string {
  return (codigo ?? "").trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export async function expedicaoHabilitada(scope: TenantScope): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: scope.tenantId },
    select: { expedicaoHabilitada: true }
  });
  return Boolean(tenant?.expedicaoHabilitada);
}

async function assertExpedicaoHabilitada(scope: TenantScope) {
  if (!(await expedicaoHabilitada(scope))) {
    throw new ExpedicaoError("Módulo Expedição não habilitado para esta conta. Fale com o suporte da plataforma.");
  }
}

/** Cria o recibo de retirada de um pedido (chamado pelo caixa/PDV após o pagamento). */
export async function criarRetiradaExpedicao(scope: TenantScope, pedidoVendaId: string) {
  await assertExpedicaoHabilitada(scope);

  const pedido = await prisma.pedidoVenda.findFirst({
    where: { id: pedidoVendaId, ...scopedByTenantCompany(scope) },
    select: { id: true, numero: true, status: true }
  });
  if (!pedido) throw new ExpedicaoError("Pedido de venda não encontrado.");
  if (pedido.status === "CANCELADO") throw new ExpedicaoError("Pedido cancelado não gera retirada.");

  const existente = await prisma.expedicaoRetirada.findFirst({
    where: { ...scopedByTenantCompany(scope), pedidoVendaId, status: "PENDENTE" }
  });
  if (existente) return existente;

  // Código curto único por empresa — colisão é rara (31^6); tenta poucas vezes.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = gerarCodigo();
    try {
      return await prisma.$transaction(async (tx) => {
        const retirada = await tx.expedicaoRetirada.create({
          data: { ...scopedByTenantCompany(scope), codigo, pedidoVendaId, status: "PENDENTE" }
        });
        await createAuditLog(tx, {
          scope,
          entidade: "ExpedicaoRetirada",
          entidadeId: retirada.id,
          acao: "CREATE",
          payload: { codigo, pedido: pedido.numero }
        });
        return retirada;
      });
    } catch (error) {
      const unique = error instanceof Error && error.message.includes("Unique constraint");
      if (!unique || tentativa === 4) throw error;
    }
  }
  throw new ExpedicaoError("Não foi possível gerar o código da retirada.");
}

/** Consulta por código (conferência do recibo na expedição). */
export async function consultarRetirada(scope: TenantScope, codigoInformado: string) {
  await assertExpedicaoHabilitada(scope);
  const codigo = normalizarCodigo(codigoInformado);
  if (!codigo) throw new ExpedicaoError("Informe o código do recibo.");

  const retirada = await prisma.expedicaoRetirada.findFirst({
    where: { ...scopedByTenantCompany(scope), codigo },
    include: {
      pedidoVenda: {
        include: {
          cliente: { select: { razaoSocial: true, nomeFantasia: true, documento: true } },
          itens: { include: { produto: { select: { nome: true, sku: true } } } },
          notasFiscais: { where: { status: "AUTORIZADA", finalidade: "NORMAL" }, select: { numero: true, modelo: true } }
        }
      }
    }
  });
  if (!retirada) {
    throw new ExpedicaoError("Recibo não encontrado — confira o código. Este recibo pode não ser desta loja.");
  }
  return retirada;
}

/** Confirma a entrega: baixa a retirada e marca o pedido como ENTREGUE. */
export async function confirmarEntregaRetirada(
  scope: TenantScope,
  codigoInformado: string,
  input: { conferente: string; observacoes?: string }
) {
  const conferente = input.conferente?.trim();
  if (!conferente) throw new ExpedicaoError("Informe o nome de quem está entregando (conferente).");

  const retirada = await consultarRetirada(scope, codigoInformado);
  if (retirada.status === "ENTREGUE") {
    throw new ExpedicaoError(
      `Este recibo JÁ FOI ENTREGUE em ${retirada.entregueEm?.toLocaleString("pt-BR") ?? ""} por ${retirada.entreguePor ?? "?"}. Não entregue novamente.`
    );
  }
  if (retirada.status === "CANCELADA") {
    throw new ExpedicaoError("Esta retirada foi cancelada (venda cancelada/devolvida). Não entregue a mercadoria.");
  }

  return prisma.$transaction(async (tx) => {
    const entregue = await tx.expedicaoRetirada.update({
      where: { id: retirada.id },
      data: {
        status: "ENTREGUE",
        entreguePor: conferente,
        entregueEm: new Date(),
        observacoes: input.observacoes?.trim() || null
      }
    });
    // Mercadoria nas mãos do cliente: pedido vai para ENTREGUE (estado final do fluxo feliz).
    if (retirada.pedidoVenda.status !== "CANCELADO") {
      await tx.pedidoVenda.update({
        where: { id: retirada.pedidoVendaId },
        data: { status: "ENTREGUE" }
      });
    }
    await createAuditLog(tx, {
      scope,
      entidade: "ExpedicaoRetirada",
      entidadeId: retirada.id,
      acao: "ENTREGAR",
      payload: { codigo: retirada.codigo, pedido: retirada.pedidoVenda.numero, conferente }
    });
    return entregue;
  });
}

/** Retiradas pendentes (fila da expedição). */
export async function listRetiradasPendentes(scope: TenantScope) {
  return prisma.expedicaoRetirada.findMany({
    where: { ...scopedByTenantCompany(scope), status: "PENDENTE" },
    include: {
      pedidoVenda: {
        select: {
          numero: true,
          total: true,
          cliente: { select: { razaoSocial: true, nomeFantasia: true } },
          itens: { select: { id: true } }
        }
      }
    },
    orderBy: { criadoEm: "asc" }
  });
}

/** Carrega a retirada por id (para o recibo imprimível). */
export async function getRetiradaParaRecibo(scope: TenantScope, id: string) {
  const retirada = await prisma.expedicaoRetirada.findFirst({
    where: { id, ...scopedByTenantCompany(scope) },
    include: {
      pedidoVenda: {
        include: {
          cliente: { select: { razaoSocial: true, nomeFantasia: true } },
          itens: { include: { produto: { select: { nome: true, sku: true } } } },
          notasFiscais: { where: { status: "AUTORIZADA", finalidade: "NORMAL" }, select: { numero: true, modelo: true } }
        }
      }
    }
  });
  if (!retirada) throw new ExpedicaoError("Retirada não encontrada.");
  const empresa = await prisma.empresa.findUnique({
    where: { id: scope.empresaId },
    select: { razaoSocial: true, nomeFantasia: true, cnpj: true }
  });
  return { retirada, empresa };
}

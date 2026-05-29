import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { nextDocumentNumber } from "@/lib/numbering";
import { getDefaultDeposito, reserveStock } from "@/domains/stock/application/stock-service";

const TX_OPTIONS = { maxWait: 10000, timeout: 30000 };

export type CreateQuoteInput = {
  clienteId: string;
  itens: Array<{
    produtoId: string;
    quantidade: number;
    precoUnitario: number;
  }>;
  validadeDias?: number;
  vendedor?: string;
  condicaoPagamento?: string;
  desconto?: number;
  observacaoVendedor?: string;
};

export async function createQuote(scope: TenantScope, input: CreateQuoteInput) {
  if (!input.clienteId) throw new Error("Cliente é obrigatório.");
  if (!input.itens || input.itens.length === 0) throw new Error("O orçamento deve ter ao menos um item.");

  return prisma.$transaction(async (tx) => {
    const numero = await nextDocumentNumber(tx.orcamento, scope, "ORC");

    const subtotal = input.itens.reduce(
      (acc, item) => acc + item.quantidade * item.precoUnitario,
      0
    );
    const desconto = input.desconto ?? 0;
    const total = Math.max(0, subtotal - desconto);

    const validoAte = input.validadeDias
      ? new Date(Date.now() + input.validadeDias * 24 * 60 * 60 * 1000)
      : null;

    const orcamento = await tx.orcamento.create({
      data: {
        ...scopedByTenantCompany(scope),
        numero,
        clienteId: input.clienteId,
        canal: "MANUAL",
        status: "EM_ANALISE",
        validoAte,
        vendedor: input.vendedor ?? null,
        condicaoPagamento: input.condicaoPagamento ?? null,
        observacaoVendedor: input.observacaoVendedor ?? null,
        desconto,
        subtotal,
        total,
        itens: {
          create: input.itens.map((item) => ({
            ...scopedByTenantCompany(scope),
            produtoId: item.produtoId,
            quantidade: item.quantidade,
            precoUnitario: item.precoUnitario,
            total: item.quantidade * item.precoUnitario,
          })),
        },
      },
      include: { itens: true },
    });

    await createAuditLog(tx, {
      scope,
      entidade: "Orcamento",
      entidadeId: orcamento.id,
      acao: "CREATE",
      payload: { numero, clienteId: input.clienteId, total },
    });

    return orcamento;
  }, TX_OPTIONS);
}

export async function approveQuote(scope: TenantScope, id: string) {
  return prisma.$transaction(async (tx) => {
    const orc = await tx.orcamento.findFirst({
      where: { id, ...scopedByTenantCompany(scope) },
    });
    if (!orc) throw new Error("Orçamento não encontrado.");
    if (orc.status === "APROVADO") return orc;
    if (!["EM_ANALISE", "AGUARDANDO_CLIENTE", "RASCUNHO"].includes(orc.status)) {
      throw new Error(`Orçamento com status ${orc.status} não pode ser aprovado.`);
    }

    const updated = await tx.orcamento.update({
      where: { id },
      data: { status: "APROVADO", aprovadoEm: new Date() },
    });

    await createAuditLog(tx, {
      scope,
      entidade: "Orcamento",
      entidadeId: id,
      acao: "APPROVE",
    });

    return updated;
  }, TX_OPTIONS);
}

export async function rejectQuote(scope: TenantScope, id: string) {
  return prisma.$transaction(async (tx) => {
    const orc = await tx.orcamento.findFirst({
      where: { id, ...scopedByTenantCompany(scope) },
    });
    if (!orc) throw new Error("Orçamento não encontrado.");
    if (orc.status === "REJEITADO") return orc;
    if (["CONVERTIDO", "REJEITADO"].includes(orc.status)) {
      throw new Error(`Orçamento com status ${orc.status} não pode ser rejeitado.`);
    }

    const updated = await tx.orcamento.update({
      where: { id },
      data: { status: "REJEITADO" },
    });

    await createAuditLog(tx, {
      scope,
      entidade: "Orcamento",
      entidadeId: id,
      acao: "REJECT",
    });

    return updated;
  }, TX_OPTIONS);
}

export async function convertQuoteToPedido(scope: TenantScope, id: string) {
  return prisma.$transaction(async (tx) => {
    const orc = await tx.orcamento.findFirst({
      where: { id, ...scopedByTenantCompany(scope) },
      include: {
        itens: {
          include: { produto: { select: { id: true, custoMedio: true, precoCusto: true } } },
        },
      },
    });

    if (!orc) throw new Error("Orçamento não encontrado.");
    if (orc.status !== "APROVADO") {
      throw new Error("Somente orçamentos APROVADOS podem ser convertidos em pedido.");
    }

    const numeroPedido = await nextDocumentNumber(tx.pedidoVenda, scope, "PV");
    const deposito = await getDefaultDeposito(tx, scope);

    const pedido = await tx.pedidoVenda.create({
      data: {
        ...scopedByTenantCompany(scope),
        numero: numeroPedido,
        clienteId: orc.clienteId,
        depositoId: deposito.id,
        canal: "ORCAMENTO",
        status: "RASCUNHO",
        vendedor: orc.vendedor ?? null,
        condicaoPagamento: orc.condicaoPagamento ?? null,
        subtotal: Number(orc.subtotal),
        desconto: Number(orc.desconto),
        frete: 0,
        total: Number(orc.total),
        origemOrcamentoId: orc.id,
        itens: {
          create: orc.itens.map((item) => {
            const custoUnitario =
              Number(item.produto.custoMedio ?? item.produto.precoCusto ?? 0);
            return {
              ...scopedByTenantCompany(scope),
              produtoId: item.produtoId,
              quantidade: item.quantidade,
              precoUnitario: Number(item.precoUnitario),
              custoUnitario,
              desconto: 0,
              total: Number(item.total),
            };
          }),
        },
      },
      include: { itens: true },
    });

    // Reserva de estoque para os itens do pedido
    for (const item of orc.itens) {
      await reserveStock(tx, scope, {
        produtoId: item.produtoId,
        depositoId: deposito.id,
        quantidade: item.quantidade,
        origemTipo: "PEDIDO_VENDA",
        origemId: pedido.id,
      });
    }

    // Marca orçamento como convertido
    await tx.orcamento.update({
      where: { id },
      data: { status: "CONVERTIDO", pedidoGeradoId: pedido.id },
    });

    await createAuditLog(tx, {
      scope,
      entidade: "Orcamento",
      entidadeId: id,
      acao: "CONVERT_TO_PEDIDO",
      payload: { pedidoId: pedido.id, numeroPedido },
    });

    return { orcamento: { id, status: "CONVERTIDO" }, pedido };
  }, TX_OPTIONS);
}

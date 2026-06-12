import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { nextDocumentNumber } from "@/lib/numbering";
import { applyStockMovement, getDefaultDeposito } from "@/domains/stock/application/stock-service";

export class PurchaseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseValidationError";
  }
}

const TX_OPTIONS = { maxWait: 10000, timeout: 30000 };

export type CreatePurchaseOrderInput = {
  fornecedorId: string;
  depositoId?: string;
  itens: Array<{
    produtoId: string;
    quantidade: number;
    custoUnitario: number;
  }>;
  frete?: number;
  condicaoPagamento?: string;
  observacoes?: string;
  previsaoEm?: string;
};

export type ReceivePurchaseOrderInput = {
  itens: Array<{
    itemId: string;
    quantidadeRecebida: number;
  }>;
  depositoId?: string;
  gerarContaPagar?: boolean;
  vencimento?: string;
};

export async function createPurchaseOrder(scope: TenantScope, input: CreatePurchaseOrderInput) {
  if (!input.fornecedorId) {
    throw new PurchaseValidationError("Fornecedor é obrigatório.");
  }

  if (!input.itens || input.itens.length === 0) {
    throw new PurchaseValidationError("O pedido deve ter ao menos um item.");
  }

  for (const item of input.itens) {
    if (!Number.isInteger(item.quantidade) || item.quantidade <= 0) {
      throw new PurchaseValidationError("A quantidade do item deve ser um inteiro positivo.");
    }

    if (item.custoUnitario < 0) {
      throw new PurchaseValidationError("O custo unitário não pode ser negativo.");
    }
  }

  return prisma.$transaction(async (tx) => {
    const fornecedor = await tx.fornecedor.findFirst({
      where: { id: input.fornecedorId, ...scopedByTenantCompany(scope), ativo: true }
    });

    if (!fornecedor) {
      throw new PurchaseValidationError("Fornecedor não encontrado ou inativo.");
    }

    const numero = await nextDocumentNumber(tx, scope, "PC", tx.pedidoCompra);
    const frete = input.frete ?? 0;

    const subtotal = input.itens.reduce((sum, item) => sum + item.quantidade * item.custoUnitario, 0);
    const total = subtotal + frete;

    const pedido = await tx.pedidoCompra.create({
      data: {
        ...scopedByTenantCompany(scope),
        numero,
        fornecedorId: input.fornecedorId,
        depositoId: input.depositoId || null,
        status: "RASCUNHO",
        condicaoPagamento: input.condicaoPagamento?.trim() || null,
        observacoes: input.observacoes?.trim() || null,
        previsaoEm: input.previsaoEm ? new Date(`${input.previsaoEm.slice(0, 10)}T12:00:00.000Z`) : null,
        frete,
        subtotal,
        total,
        itens: {
          createMany: {
            data: input.itens.map((item) => ({
              ...scopedByTenantCompany(scope),
              produtoId: item.produtoId,
              quantidade: item.quantidade,
              quantidadeRecebida: 0,
              custoUnitario: item.custoUnitario,
              total: item.quantidade * item.custoUnitario
            }))
          }
        }
      },
      include: { itens: true }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "PedidoCompra",
      entidadeId: pedido.id,
      acao: "CREATE",
      payload: { numero, fornecedorId: input.fornecedorId, itens: input.itens.length, total }
    });

    return pedido;
  }, TX_OPTIONS);
}

export async function sendPurchaseOrder(scope: TenantScope, id: string) {
  return prisma.$transaction(async (tx) => {
    const pedido = await tx.pedidoCompra.findFirst({
      where: { id, ...scopedByTenantCompany(scope) }
    });

    if (!pedido) {
      throw new PurchaseValidationError("Pedido de compra não encontrado.");
    }

    if (pedido.status !== "RASCUNHO") {
      throw new PurchaseValidationError(`Não é possível enviar um pedido no status ${pedido.status}.`);
    }

    const updated = await tx.pedidoCompra.update({
      where: { id },
      data: { status: "ENVIADO" }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "PedidoCompra",
      entidadeId: id,
      acao: "SEND",
      payload: { numero: pedido.numero }
    });

    return updated;
  }, TX_OPTIONS);
}

export async function receivePurchaseOrder(scope: TenantScope, id: string, input: ReceivePurchaseOrderInput) {
  return prisma.$transaction(async (tx) => {
    const pedido = await tx.pedidoCompra.findFirst({
      where: { id, ...scopedByTenantCompany(scope) },
      include: { itens: true }
    });

    if (!pedido) {
      throw new PurchaseValidationError("Pedido de compra não encontrado.");
    }

    if (pedido.status === "CANCELADO" || pedido.status === "RECEBIDO") {
      throw new PurchaseValidationError(`Não é possível receber um pedido no status ${pedido.status}.`);
    }

    const deposito = input.depositoId
      ? await tx.deposito.findFirst({ where: { id: input.depositoId, ...scopedByTenantCompany(scope) } })
      : await getDefaultDeposito(tx, scope);

    if (!deposito) {
      throw new PurchaseValidationError("Depósito não encontrado.");
    }

    let totalRecebido = 0;

    for (const receiveItem of input.itens) {
      const pedidoItem = pedido.itens.find((i) => i.id === receiveItem.itemId);

      if (!pedidoItem) {
        throw new PurchaseValidationError(`Item ${receiveItem.itemId} não pertence a este pedido.`);
      }

      if (receiveItem.quantidadeRecebida <= 0) continue;

      const qtdRecebidaAntes = Number(pedidoItem.quantidadeRecebida);
      const qtdTotalRecebida = qtdRecebidaAntes + receiveItem.quantidadeRecebida;

      // Bloqueia recebimento acima do pedido. Sem flag de "permitir receber a mais"
      // no schema, qualquer excedente é barrado para não inflar estoque/contas a pagar.
      const qtdPedido = Number(pedidoItem.quantidade);
      if (qtdTotalRecebida > qtdPedido) {
        const saldoAReceber = qtdPedido - qtdRecebidaAntes;
        throw new PurchaseValidationError(
          `Quantidade recebida excede o pedido para o item ${receiveItem.itemId}. ` +
            `Pedido: ${qtdPedido}, já recebido: ${qtdRecebidaAntes}, saldo a receber: ${saldoAReceber}.`
        );
      }

      await tx.pedidoCompraItem.update({
        where: { id: receiveItem.itemId },
        data: { quantidadeRecebida: qtdTotalRecebida }
      });

      await applyStockMovement(tx, scope, {
        produtoId: pedidoItem.produtoId,
        depositoId: deposito.id,
        tipo: "ENTRADA",
        quantidade: receiveItem.quantidadeRecebida,
        custoUnitario: Number(pedidoItem.custoUnitario),
        documentoTipo: "PEDIDO_COMPRA",
        documentoId: id,
        idempotencyKey: `pedido-compra:${id}:item:${receiveItem.itemId}:rcv:${qtdRecebidaAntes}`,
        observacoes: `Recebimento pedido de compra ${pedido.numero}.`
      });

      totalRecebido += receiveItem.quantidadeRecebida * Number(pedidoItem.custoUnitario);
    }

    // Re-fetch itens atualizados para checar se tudo foi recebido
    const itensAtualizados = await tx.pedidoCompraItem.findMany({
      where: { pedidoCompraId: id, ...scopedByTenantCompany(scope) }
    });

    const todosRecebidos = itensAtualizados.every(
      (item) => Number(item.quantidadeRecebida) >= item.quantidade
    );

    const novoStatus = todosRecebidos ? "RECEBIDO" : "PARCIAL";

    await tx.pedidoCompra.update({
      where: { id },
      data: { status: novoStatus }
    });

    if (input.gerarContaPagar && totalRecebido > 0) {
      const vencimento = input.vencimento
        ? new Date(`${input.vencimento.slice(0, 10)}T12:00:00.000Z`)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await tx.contaPagar.create({
        data: {
          ...scopedByTenantCompany(scope),
          fornecedorId: pedido.fornecedorId,
          pedidoCompraId: id,
          descricao: `Pedido de compra ${pedido.numero}`,
          numeroDocumento: pedido.numero,
          origem: "PEDIDO_COMPRA",
          vencimento,
          valor: totalRecebido,
          valorPago: 0,
          juros: 0,
          multa: 0,
          descontoBaixa: 0,
          status: "ABERTO"
        }
      });
    }

    await createAuditLog(tx, {
      scope,
      entidade: "PedidoCompra",
      entidadeId: id,
      acao: "RECEIVE",
      payload: {
        numero: pedido.numero,
        status: novoStatus,
        totalRecebido,
        gerarContaPagar: input.gerarContaPagar ?? false
      }
    });

    return { id, status: novoStatus, totalRecebido };
  }, TX_OPTIONS);
}

export async function cancelPurchaseOrder(scope: TenantScope, id: string) {
  return prisma.$transaction(async (tx) => {
    const pedido = await tx.pedidoCompra.findFirst({
      where: { id, ...scopedByTenantCompany(scope) }
    });

    if (!pedido) {
      throw new PurchaseValidationError("Pedido de compra não encontrado.");
    }

    if (pedido.status === "RECEBIDO" || pedido.status === "PARCIAL") {
      throw new PurchaseValidationError(
        "Não é possível cancelar um pedido com estoque já movimentado (RECEBIDO ou PARCIAL)."
      );
    }

    if (pedido.status === "CANCELADO") {
      throw new PurchaseValidationError("O pedido já está cancelado.");
    }

    const updated = await tx.pedidoCompra.update({
      where: { id },
      data: { status: "CANCELADO" }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "PedidoCompra",
      entidadeId: id,
      acao: "CANCEL",
      payload: { numero: pedido.numero, statusAnterior: pedido.status }
    });

    return updated;
  }, TX_OPTIONS);
}

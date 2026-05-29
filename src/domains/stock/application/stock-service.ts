import { randomUUID } from "node:crypto";
import type { Prisma, TipoMovimentoEstoque } from "@prisma/client";
import type { TenantScope } from "@/lib/auth/dev-session";

const SEM_CONTROLE = "SEM_CONTROLE";

export const DEFAULT_DEPOSITO_NOME = "Galpão LEM-1 · Estoque geral";

/**
 * Resolve o depósito padrão da empresa (cria se necessário). Operações de estoque
 * sem depósito explícito caem aqui para manter rastreabilidade.
 */
export async function getDefaultDeposito(tx: Prisma.TransactionClient, scope: TenantScope) {
  const existingPadrao = await tx.deposito.findFirst({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId, padrao: true, ativo: true }
  });

  if (existingPadrao) {
    return existingPadrao;
  }

  return tx.deposito.upsert({
    where: {
      tenantId_empresaId_nome: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        nome: DEFAULT_DEPOSITO_NOME
      }
    },
    update: { padrao: true, ativo: true },
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      nome: DEFAULT_DEPOSITO_NOME,
      uf: "BA",
      padrao: true
    }
  });
}

async function getSaldo(tx: Prisma.TransactionClient, scope: TenantScope, produtoId: string, depositoId: string) {
  return tx.estoqueSaldo.findUnique({
    where: {
      tenantId_empresaId_produtoId_depositoId_controleKey: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        produtoId,
        depositoId,
        controleKey: SEM_CONTROLE
      }
    }
  });
}

async function setSaldoQuantidade(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  produtoId: string,
  depositoId: string,
  quantidade: number
) {
  await tx.estoqueSaldo.upsert({
    where: {
      tenantId_empresaId_produtoId_depositoId_controleKey: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        produtoId,
        depositoId,
        controleKey: SEM_CONTROLE
      }
    },
    update: { quantidade },
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      produtoId,
      depositoId,
      controleKey: SEM_CONTROLE,
      quantidade
    }
  });
}

type MovementInput = {
  produtoId: string;
  depositoId: string;
  tipo: TipoMovimentoEstoque;
  /** Quantidade absoluta movimentada (sempre positiva). O sinal é derivado do tipo. */
  quantidade: number;
  custoUnitario?: number;
  documentoTipo?: string;
  documentoId?: string;
  idempotencyKey?: string;
  origem?: string;
  origemId?: string;
  usuarioId?: string;
  observacoes?: string;
};

const TIPOS_ENTRADA: TipoMovimentoEstoque[] = ["ENTRADA"];
const TIPOS_SAIDA: TipoMovimentoEstoque[] = ["SAIDA"];

/**
 * Aplica um movimento de estoque dentro de uma transação: atualiza saldo, recalcula
 * custo médio ponderado em entradas, grava EstoqueMovimento idempotente e devolve
 * os saldos antes/depois. Lança erro em saldo negativo quando o produto não permite.
 */
export async function applyStockMovement(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  input: MovementInput
) {
  if (input.quantidade <= 0) {
    throw new Error("Quantidade do movimento de estoque deve ser maior que zero.");
  }

  const produto = await tx.produto.findFirst({
    where: { id: input.produtoId, tenantId: scope.tenantId, empresaId: scope.empresaId },
    select: { id: true, sku: true, custoMedio: true, precoCusto: true, permiteEstoqueNegativo: true }
  });

  if (!produto) {
    throw new Error("Produto não encontrado para movimentação de estoque.");
  }

  const saldo = await getSaldo(tx, scope, input.produtoId, input.depositoId);
  const saldoAntes = Number(saldo?.quantidade ?? 0);

  const isEntrada = TIPOS_ENTRADA.includes(input.tipo);
  const isSaida = TIPOS_SAIDA.includes(input.tipo) || (input.tipo === "ESTORNO");
  const delta = isEntrada ? input.quantidade : isSaida ? -input.quantidade : input.quantidade;
  const saldoDepois = saldoAntes + delta;

  if (saldoDepois < 0 && !produto.permiteEstoqueNegativo) {
    throw new Error(
      `Saldo insuficiente para o SKU ${produto.sku}. Saldo atual ${saldoAntes}, movimento ${delta}.`
    );
  }

  const custoUnitario = input.custoUnitario ?? Number(produto.custoMedio ?? produto.precoCusto ?? 0);

  // Custo médio ponderado: apenas entradas com custo positivo recalculam.
  if (isEntrada && saldoDepois > 0) {
    const previousAverage = Number(produto.custoMedio ?? produto.precoCusto ?? custoUnitario);
    const weighted = ((saldoAntes * previousAverage) + (input.quantidade * custoUnitario)) / saldoDepois;
    await tx.produto.update({
      where: { id: produto.id },
      data: { custoMedio: weighted, ultimoCusto: custoUnitario }
    });
  }

  await setSaldoQuantidade(tx, scope, input.produtoId, input.depositoId, saldoDepois);

  await tx.estoqueMovimento.create({
    data: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      produtoId: input.produtoId,
      depositoId: input.depositoId,
      tipo: input.tipo,
      quantidade: delta,
      saldoAntes,
      saldoDepois,
      custoUnitario,
      custoTotal: custoUnitario * input.quantidade * (delta < 0 ? -1 : 1),
      documentoTipo: input.documentoTipo,
      documentoId: input.documentoId,
      idempotencyKey: input.idempotencyKey ?? `mov:${randomUUID()}`,
      origem: input.origem,
      origemId: input.origemId,
      usuarioId: input.usuarioId,
      observacoes: input.observacoes
    }
  });

  return { saldoAntes, saldoDepois, custoUnitario, delta };
}

type ReservationInput = {
  produtoId: string;
  depositoId: string;
  quantidade: number;
  origemTipo: string;
  origemId: string;
  expiraEm?: Date | null;
};

/**
 * Reserva saldo disponível (quantidade - reservado). Não baixa fisicamente; apenas
 * incrementa `reservado` e registra a reserva para liberação/baixa posterior.
 */
export async function reserveStock(tx: Prisma.TransactionClient, scope: TenantScope, input: ReservationInput) {
  if (input.quantidade <= 0) {
    return null;
  }

  const produto = await tx.produto.findFirst({
    where: { id: input.produtoId, tenantId: scope.tenantId, empresaId: scope.empresaId },
    select: { sku: true, permiteEstoqueNegativo: true, permiteVendaSobEncomenda: true }
  });

  if (!produto) {
    throw new Error("Produto não encontrado para reserva de estoque.");
  }

  const saldo = await getSaldo(tx, scope, input.produtoId, input.depositoId);
  const disponivel = Number(saldo?.quantidade ?? 0) - Number(saldo?.reservado ?? 0);

  if (disponivel < input.quantidade && !produto.permiteEstoqueNegativo && !produto.permiteVendaSobEncomenda) {
    throw new Error(`Estoque disponível insuficiente para o SKU ${produto.sku}. Disponível ${disponivel}.`);
  }

  await tx.estoqueSaldo.upsert({
    where: {
      tenantId_empresaId_produtoId_depositoId_controleKey: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        produtoId: input.produtoId,
        depositoId: input.depositoId,
        controleKey: SEM_CONTROLE
      }
    },
    update: { reservado: { increment: input.quantidade } },
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      produtoId: input.produtoId,
      depositoId: input.depositoId,
      controleKey: SEM_CONTROLE,
      quantidade: 0,
      reservado: input.quantidade
    }
  });

  return tx.estoqueReserva.create({
    data: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      produtoId: input.produtoId,
      depositoId: input.depositoId,
      quantidade: input.quantidade,
      origemTipo: input.origemTipo,
      origemId: input.origemId,
      expiraEm: input.expiraEm ?? null,
      ativa: true
    }
  });
}

/**
 * Libera todas as reservas ativas de uma origem (ex.: pedido cancelado), devolvendo
 * o valor reservado ao saldo disponível.
 */
export async function releaseReservations(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  origemTipo: string,
  origemId: string
) {
  const reservas = await tx.estoqueReserva.findMany({
    where: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      origemTipo,
      origemId,
      ativa: true
    }
  });

  for (const reserva of reservas) {
    await tx.estoqueSaldo.updateMany({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        produtoId: reserva.produtoId,
        depositoId: reserva.depositoId,
        controleKey: SEM_CONTROLE
      },
      data: { reservado: { decrement: Number(reserva.quantidade) } }
    });
    await tx.estoqueReserva.update({
      where: { id: reserva.id },
      data: { ativa: false }
    });
  }

  return reservas.length;
}

/**
 * Efetiva a saída física referente a reservas de uma origem: libera o reservado e
 * grava o movimento de SAIDA com custo médio do produto (CMV).
 */
export async function commitReservationsAsExit(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  origemTipo: string,
  origemId: string,
  documento: { documentoTipo: string; documentoId: string; observacoes?: string; usuarioId?: string }
) {
  const reservas = await tx.estoqueReserva.findMany({
    where: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      origemTipo,
      origemId,
      ativa: true
    }
  });

  for (const reserva of reservas) {
    await tx.estoqueSaldo.updateMany({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        produtoId: reserva.produtoId,
        depositoId: reserva.depositoId,
        controleKey: SEM_CONTROLE
      },
      data: { reservado: { decrement: Number(reserva.quantidade) } }
    });

    await applyStockMovement(tx, scope, {
      produtoId: reserva.produtoId,
      depositoId: reserva.depositoId,
      tipo: "SAIDA",
      quantidade: Number(reserva.quantidade),
      documentoTipo: documento.documentoTipo,
      documentoId: documento.documentoId,
      idempotencyKey: `${documento.documentoTipo.toLowerCase()}:${documento.documentoId}:reserva:${reserva.id}`,
      origem: origemTipo,
      origemId,
      usuarioId: documento.usuarioId,
      observacoes: documento.observacoes
    });

    await tx.estoqueReserva.update({
      where: { id: reserva.id },
      data: { ativa: false }
    });
  }

  return reservas.length;
}

/**
 * Saída direta (sem reserva prévia) — usado por venda balcão / faturamento imediato.
 */
export async function exitStock(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  items: Array<{ produtoId: string; depositoId: string; quantidade: number; custoUnitario?: number }>,
  documento: { documentoTipo: string; documentoId: string; observacoes?: string; usuarioId?: string }
) {
  for (const [index, item] of items.entries()) {
    await applyStockMovement(tx, scope, {
      produtoId: item.produtoId,
      depositoId: item.depositoId,
      tipo: "SAIDA",
      quantidade: item.quantidade,
      custoUnitario: item.custoUnitario,
      documentoTipo: documento.documentoTipo,
      documentoId: documento.documentoId,
      idempotencyKey: `${documento.documentoTipo.toLowerCase()}:${documento.documentoId}:item:${index}`,
      usuarioId: documento.usuarioId,
      observacoes: documento.observacoes
    });
  }
}

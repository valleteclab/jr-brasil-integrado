import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { applyStockMovement, getDefaultDeposito } from "./stock-service";

// ──────────────────────────────────────────────
// adjustStock
// ──────────────────────────────────────────────

export type AdjustStockInput = {
  produtoId: string;
  depositoId?: string;
  novaQuantidade: number;
  motivo: string;
  usuarioId?: string;
};

export async function adjustStock(scope: TenantScope, input: AdjustStockInput) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const deposito = input.depositoId
      ? await tx.deposito.findFirst({
          where: { id: input.depositoId, ...scopedByTenantCompany(scope), ativo: true }
        })
      : await getDefaultDeposito(tx, scope);

    if (!deposito) {
      throw new Error("Depósito não encontrado.");
    }

    const saldo = await tx.estoqueSaldo.findUnique({
      where: {
        tenantId_empresaId_produtoId_depositoId_controleKey: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          produtoId: input.produtoId,
          depositoId: deposito.id,
          controleKey: "SEM_CONTROLE"
        }
      }
    });

    const saldoAtual = Number(saldo?.quantidade ?? 0);
    const delta = input.novaQuantidade - saldoAtual;

    if (delta === 0) {
      return { delta: 0, saldoAntes: saldoAtual, saldoDepois: saldoAtual };
    }

    const resultado = await applyStockMovement(tx, scope, {
      produtoId: input.produtoId,
      depositoId: deposito.id,
      tipo: delta > 0 ? "ENTRADA" : "SAIDA",
      quantidade: Math.abs(delta),
      documentoTipo: "AJUSTE_ESTOQUE",
      documentoId: `ajuste:${randomUUID()}`,
      usuarioId: input.usuarioId,
      observacoes: input.motivo
    });

    await createAuditLog(tx, {
      scope,
      entidade: "EstoqueAjuste",
      entidadeId: input.produtoId,
      acao: "AJUSTE_ESTOQUE",
      payload: {
        produtoId: input.produtoId,
        depositoId: deposito.id,
        depositoNome: deposito.nome,
        saldoAntes: resultado.saldoAntes,
        saldoDepois: resultado.saldoDepois,
        delta,
        motivo: input.motivo,
        usuarioId: input.usuarioId ?? null
      }
    });

    return resultado;
  });
}

// ──────────────────────────────────────────────
// transferStock
// ──────────────────────────────────────────────

export type TransferStockInput = {
  produtoId: string;
  depositoOrigemId: string;
  depositoDestinoId: string;
  quantidade: number;
  usuarioId?: string;
};

export async function transferStock(scope: TenantScope, input: TransferStockInput) {
  if (input.quantidade <= 0) {
    throw new Error("Quantidade da transferência deve ser maior que zero.");
  }

  if (input.depositoOrigemId === input.depositoDestinoId) {
    throw new Error("Depósito de origem e destino não podem ser iguais.");
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const [origem, destino] = await Promise.all([
      tx.deposito.findFirst({
        where: { id: input.depositoOrigemId, ...scopedByTenantCompany(scope), ativo: true }
      }),
      tx.deposito.findFirst({
        where: { id: input.depositoDestinoId, ...scopedByTenantCompany(scope), ativo: true }
      })
    ]);

    if (!origem) throw new Error("Depósito de origem não encontrado.");
    if (!destino) throw new Error("Depósito de destino não encontrado.");

    const transferId = `transf:${randomUUID()}`;

    // 1. SAIDA no depósito de origem (retorna custoUnitario calculado)
    const saida = await applyStockMovement(tx, scope, {
      produtoId: input.produtoId,
      depositoId: origem.id,
      tipo: "SAIDA",
      quantidade: input.quantidade,
      documentoTipo: "TRANSFERENCIA",
      documentoId: transferId,
      idempotencyKey: `${transferId}:origem`,
      usuarioId: input.usuarioId,
      observacoes: `Transferência para ${destino.nome}`
    });

    // 2. ENTRADA no depósito de destino com o mesmo custo unitário
    const entrada = await applyStockMovement(tx, scope, {
      produtoId: input.produtoId,
      depositoId: destino.id,
      tipo: "ENTRADA",
      quantidade: input.quantidade,
      custoUnitario: saida.custoUnitario,
      documentoTipo: "TRANSFERENCIA",
      documentoId: transferId,
      idempotencyKey: `${transferId}:destino`,
      usuarioId: input.usuarioId,
      observacoes: `Transferência de ${origem.nome}`
    });

    await createAuditLog(tx, {
      scope,
      entidade: "EstoqueTransferencia",
      entidadeId: transferId,
      acao: "TRANSFERENCIA_ESTOQUE",
      payload: {
        produtoId: input.produtoId,
        depositoOrigemId: origem.id,
        depositoOrigemNome: origem.nome,
        depositoDestinoId: destino.id,
        depositoDestinoNome: destino.nome,
        quantidade: input.quantidade,
        custoUnitario: saida.custoUnitario,
        saldoOrigemDepois: saida.saldoDepois,
        saldoDestinoDepois: entrada.saldoDepois,
        usuarioId: input.usuarioId ?? null
      }
    });

    return { transferId, saida, entrada };
  });
}

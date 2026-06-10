import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { nextDocumentNumber } from "@/lib/numbering";
import { applyStockMovement } from "./stock-service";

// ──────────────────────────────────────────────
// createInventory
// ──────────────────────────────────────────────

export type CreateInventoryInput = {
  depositoId: string;
  descricao?: string;
  usuarioId?: string;
};

export async function createInventory(scope: TenantScope, input: CreateInventoryInput) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Validate deposito
    const deposito = await tx.deposito.findFirst({
      where: { id: input.depositoId, ...scopedByTenantCompany(scope), ativo: true }
    });
    if (!deposito) throw new Error("Depósito não encontrado.");

    // Next document number
    const numero = await nextDocumentNumber(tx, scope, "INV", tx.inventario);

    // Get all active products
    const produtos = await tx.produto.findMany({
      where: { ...scopedByTenantCompany(scope), ativo: true },
      select: { id: true, custoMedio: true, precoCusto: true }
    });

    // Get current balances for this deposito
    const saldos = await tx.estoqueSaldo.findMany({
      where: {
        ...scopedByTenantCompany(scope),
        depositoId: input.depositoId,
        controleKey: "SEM_CONTROLE"
      },
      select: { produtoId: true, quantidade: true }
    });

    const saldoMap = new Map<string, number>();
    for (const s of saldos) {
      saldoMap.set(s.produtoId, Number(s.quantidade));
    }

    // Create inventario
    const inventario = await tx.inventario.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        depositoId: input.depositoId,
        numero,
        descricao: input.descricao ?? null,
        status: "ABERTO",
        iniciadoEm: new Date()
      }
    });

    // Create InventarioItem for each active product
    if (produtos.length > 0) {
      await tx.inventarioItem.createMany({
        data: produtos.map((p) => ({
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          inventarioId: inventario.id,
          produtoId: p.id,
          saldoSistema: saldoMap.get(p.id) ?? 0,
          custoUnitario: Number(p.custoMedio ?? p.precoCusto ?? 0),
          contado: false,
          ajustado: false
        }))
      });
    }

    await createAuditLog(tx, {
      scope,
      entidade: "Inventario",
      entidadeId: inventario.id,
      acao: "CRIAR_INVENTARIO",
      payload: {
        numero,
        depositoId: input.depositoId,
        depositoNome: deposito.nome,
        totalProdutos: produtos.length,
        usuarioId: input.usuarioId ?? null
      }
    });

    return inventario;
  });
}

// ──────────────────────────────────────────────
// countInventoryItem
// ──────────────────────────────────────────────

export async function countInventoryItem(
  scope: TenantScope,
  inventarioId: string,
  itemId: string,
  saldoContado: number
) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const inventario = await tx.inventario.findFirst({
      where: { id: inventarioId, ...scopedByTenantCompany(scope) }
    });

    if (!inventario) throw new Error("Inventário não encontrado.");
    if (inventario.status === "FINALIZADO") throw new Error("Inventário já finalizado.");
    if (inventario.status === "CANCELADO") throw new Error("Inventário cancelado.");

    const item = await tx.inventarioItem.findFirst({
      where: { id: itemId, inventarioId, ...scopedByTenantCompany(scope) }
    });

    if (!item) throw new Error("Item de inventário não encontrado.");

    const updated = await tx.inventarioItem.update({
      where: { id: itemId },
      data: { saldoContado, contado: true }
    });

    // Auto-update status to EM_CONTAGEM if still ABERTO
    if (inventario.status === "ABERTO") {
      await tx.inventario.update({
        where: { id: inventarioId },
        data: { status: "EM_CONTAGEM" }
      });
    }

    return updated;
  });
}

// ──────────────────────────────────────────────
// finalizeInventory
// ──────────────────────────────────────────────

export async function finalizeInventory(scope: TenantScope, id: string, usuarioId?: string) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const inventario = await tx.inventario.findFirst({
      where: { id, ...scopedByTenantCompany(scope) },
      include: { itens: true }
    });

    if (!inventario) throw new Error("Inventário não encontrado.");
    if (inventario.status === "FINALIZADO") throw new Error("Inventário já está finalizado.");
    if (inventario.status === "CANCELADO") throw new Error("Inventário cancelado, não pode ser finalizado.");

    let ajustesRealizados = 0;

    for (const item of inventario.itens) {
      if (!item.contado || item.saldoContado === null) continue;

      const sistema = Number(item.saldoSistema);
      const contado = Number(item.saldoContado);
      const diferenca = contado - sistema;

      if (diferenca === 0) continue;

      const tipo = diferenca > 0 ? "ENTRADA" : "SAIDA";

      await applyStockMovement(tx, scope, {
        produtoId: item.produtoId,
        depositoId: inventario.depositoId,
        tipo,
        quantidade: Math.abs(diferenca),
        custoUnitario: Number(item.custoUnitario),
        documentoTipo: "INVENTARIO",
        documentoId: inventario.id,
        idempotencyKey: `inventario:${inventario.id}:item:${item.id}`,
        usuarioId,
        observacoes: `Ajuste de inventário ${inventario.numero}`
      });

      await tx.inventarioItem.update({
        where: { id: item.id },
        data: { ajustado: true }
      });

      ajustesRealizados++;
    }

    const finalizado = await tx.inventario.update({
      where: { id: inventario.id },
      data: { status: "FINALIZADO", finalizadoEm: new Date() }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "Inventario",
      entidadeId: inventario.id,
      acao: "FINALIZAR_INVENTARIO",
      payload: {
        numero: inventario.numero,
        totalItens: inventario.itens.length,
        itenContados: inventario.itens.filter((i) => i.contado).length,
        ajustesRealizados,
        usuarioId: usuarioId ?? null
      }
    });

    return { inventario: finalizado, ajustesRealizados };
  });
}

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

// ─── Vendedores ──────────────────────────────────────────────────────────────────

export type VendedorInput = {
  nome: string;
  email?: string | null;
  percentualComissao?: number;
  ativo?: boolean;
};

export async function listVendedores(scope: TenantScope, options?: { somenteAtivos?: boolean }) {
  return prisma.vendedor.findMany({
    where: { ...scopedByTenantCompany(scope), ...(options?.somenteAtivos ? { ativo: true } : {}) },
    orderBy: { nome: "asc" }
  });
}

export async function createVendedor(scope: TenantScope, input: VendedorInput) {
  const nome = input.nome?.trim();
  if (!nome) throw new Error("Informe o nome do vendedor.");
  const percentual = Number(input.percentualComissao ?? 0);
  if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
    throw new Error("Percentual de comissão deve estar entre 0 e 100.");
  }

  return prisma.$transaction(async (tx) => {
    const existente = await tx.vendedor.findFirst({
      where: { ...scopedByTenantCompany(scope), nome: { equals: nome, mode: "insensitive" } }
    });
    if (existente) throw new Error(`Já existe um vendedor chamado "${nome}".`);

    const vendedor = await tx.vendedor.create({
      data: {
        ...scopedByTenantCompany(scope),
        nome,
        email: input.email?.trim() || null,
        percentualComissao: percentual,
        ativo: input.ativo ?? true
      }
    });
    await createAuditLog(tx, {
      scope,
      entidade: "Vendedor",
      entidadeId: vendedor.id,
      acao: "CREATE",
      payload: { nome, percentualComissao: percentual }
    });
    return vendedor;
  });
}

export async function updateVendedor(scope: TenantScope, id: string, input: Partial<VendedorInput>) {
  const vendedor = await prisma.vendedor.findFirst({ where: { id, ...scopedByTenantCompany(scope) } });
  if (!vendedor) throw new Error("Vendedor não encontrado.");

  const data: Prisma.VendedorUpdateInput = {};
  if (input.nome !== undefined) {
    const nome = input.nome?.trim();
    if (!nome) throw new Error("Informe o nome do vendedor.");
    data.nome = nome;
  }
  if (input.email !== undefined) data.email = input.email?.trim() || null;
  if (input.percentualComissao !== undefined) {
    const percentual = Number(input.percentualComissao);
    if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
      throw new Error("Percentual de comissão deve estar entre 0 e 100.");
    }
    data.percentualComissao = percentual;
  }
  if (input.ativo !== undefined) data.ativo = Boolean(input.ativo);

  return prisma.$transaction(async (tx) => {
    const atualizado = await tx.vendedor.update({ where: { id }, data });
    await createAuditLog(tx, {
      scope,
      entidade: "Vendedor",
      entidadeId: id,
      acao: "UPDATE",
      payload: { ...input }
    });
    return atualizado;
  });
}

// ─── Comissões ───────────────────────────────────────────────────────────────────

/**
 * Cria a comissão de um pedido confirmado (chamado dentro da transação do confirmSale).
 * Base = total da venda menos o frete. Percentual congelado do cadastro do vendedor no
 * momento da confirmação. Não cria nada quando o percentual é zero.
 */
export async function criarComissaoVenda(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  pedido: { id: string; numero: string; vendedorId: string | null; total: Prisma.Decimal | number; frete: Prisma.Decimal | number }
) {
  if (!pedido.vendedorId) return null;
  const vendedor = await tx.vendedor.findFirst({
    where: { id: pedido.vendedorId, ...scopedByTenantCompany(scope) }
  });
  if (!vendedor) return null;
  const percentual = Number(vendedor.percentualComissao);
  if (percentual <= 0) return null;

  const base = round2(Number(pedido.total) - Number(pedido.frete));
  if (base <= 0) return null;
  const valor = round2(base * (percentual / 100));

  const comissao = await tx.comissaoVenda.create({
    data: {
      ...scopedByTenantCompany(scope),
      vendedorId: vendedor.id,
      pedidoVendaId: pedido.id,
      base,
      percentual,
      valor,
      status: "A_PAGAR"
    }
  });
  await createAuditLog(tx, {
    scope,
    entidade: "ComissaoVenda",
    entidadeId: comissao.id,
    acao: "CREATE",
    payload: { pedido: pedido.numero, vendedor: vendedor.nome, base, percentual, valor }
  });
  return comissao;
}

/** Cancela a comissão em aberto de um pedido (cancelamento da venda). */
export async function cancelarComissaoPedido(tx: Prisma.TransactionClient, scope: TenantScope, pedidoVendaId: string) {
  await tx.comissaoVenda.updateMany({
    where: { ...scopedByTenantCompany(scope), pedidoVendaId, status: "A_PAGAR" },
    data: { status: "CANCELADO" }
  });
}

/**
 * Abate proporcionalmente a comissão em aberto quando há devolução de venda.
 * fator = valor devolvido / total do pedido. Comissão já paga não é mexida (acerto manual).
 */
export async function abaterComissaoPorDevolucao(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  pedidoVendaId: string,
  fator: number,
  referencia: string
) {
  if (fator <= 0) return;
  const comissao = await tx.comissaoVenda.findFirst({
    where: { ...scopedByTenantCompany(scope), pedidoVendaId, status: "A_PAGAR" }
  });
  if (!comissao) return;

  const abate = round2(Number(comissao.valor) * Math.min(fator, 1));
  const novoValor = Math.max(0, round2(Number(comissao.valor) - abate));
  await tx.comissaoVenda.update({
    where: { id: comissao.id },
    data: {
      valor: novoValor,
      base: Math.max(0, round2(Number(comissao.base) * (1 - Math.min(fator, 1)))),
      status: novoValor <= 0 ? "CANCELADO" : "A_PAGAR",
      observacoes: [comissao.observacoes, `Abatido ${abate.toFixed(2)} por devolução (${referencia}).`]
        .filter(Boolean)
        .join(" ")
    }
  });
}

export type ComissaoFiltro = {
  vendedorId?: string | null;
  status?: "A_PAGAR" | "PAGO" | "CANCELADO" | null;
};

export async function listComissoes(scope: TenantScope, filtro: ComissaoFiltro = {}) {
  return prisma.comissaoVenda.findMany({
    where: {
      ...scopedByTenantCompany(scope),
      ...(filtro.vendedorId ? { vendedorId: filtro.vendedorId } : {}),
      ...(filtro.status ? { status: filtro.status } : {})
    },
    include: {
      vendedor: { select: { id: true, nome: true } },
      pedidoVenda: { select: { id: true, numero: true, total: true, confirmadoEm: true } }
    },
    orderBy: { criadoEm: "desc" }
  });
}

/** Marca a comissão como paga (acerto com o vendedor feito por fora, ex.: folha). */
export async function pagarComissao(scope: TenantScope, id: string) {
  return prisma.$transaction(async (tx) => {
    const comissao = await tx.comissaoVenda.findFirst({ where: { id, ...scopedByTenantCompany(scope) } });
    if (!comissao) throw new Error("Comissão não encontrada.");
    if (comissao.status !== "A_PAGAR") throw new Error(`Comissão com status ${comissao.status} não pode ser paga.`);

    const paga = await tx.comissaoVenda.update({
      where: { id },
      data: { status: "PAGO", pagoEm: new Date() }
    });
    await createAuditLog(tx, {
      scope,
      entidade: "ComissaoVenda",
      entidadeId: id,
      acao: "PAGAR",
      payload: { valor: Number(comissao.valor) }
    });
    return paga;
  });
}

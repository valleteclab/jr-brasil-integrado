import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";

/**
 * Expedição (balcão de retirada): o caixa emite um recibo com código curto junto da nota;
 * o cliente apresenta o recibo na expedição, o conferente digita/escaneia o código,
 * confere os itens e confirma a entrega — TOTAL ou PARCIAL (informando a quantidade de
 * cada item que está saindo). O recibo continua valendo para o restante (status PARCIAL)
 * até completar (status ENTREGUE, pedido → ENTREGUE).
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

/** Soma as quantidades do pedido por produto (linhas repetidas do mesmo produto somam). */
function quantidadesPorProduto(itens: Array<{ produtoId: string; quantidade: number }>) {
  const mapa = new Map<string, number>();
  for (const item of itens) mapa.set(item.produtoId, (mapa.get(item.produtoId) ?? 0) + item.quantidade);
  return mapa;
}

/** Cria o recibo de retirada de um pedido (chamado pelo caixa/PDV após o pagamento). */
export async function criarRetiradaExpedicao(scope: TenantScope, pedidoVendaId: string) {
  await assertExpedicaoHabilitada(scope);

  const pedido = await prisma.pedidoVenda.findFirst({
    where: { id: pedidoVendaId, ...scopedByTenantCompany(scope) },
    select: { id: true, numero: true, status: true, itens: { select: { produtoId: true, quantidade: true } } }
  });
  if (!pedido) throw new ExpedicaoError("Pedido de venda não encontrado.");
  if (pedido.status === "CANCELADO") throw new ExpedicaoError("Pedido cancelado não gera retirada.");

  const existente = await prisma.expedicaoRetirada.findFirst({
    where: { ...scopedByTenantCompany(scope), pedidoVendaId, status: { in: ["PENDENTE", "PARCIAL"] } }
  });
  if (existente) return existente;

  const itensCreate = Array.from(quantidadesPorProduto(pedido.itens).entries()).map(([produtoId, quantidade]) => ({
    tenantId: scope.tenantId,
    empresaId: scope.empresaId,
    produtoId,
    quantidade,
    entregue: 0
  }));

  // Código curto único por empresa — colisão é rara (31^6); tenta poucas vezes.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = gerarCodigo();
    try {
      return await prisma.$transaction(async (tx) => {
        const retirada = await tx.expedicaoRetirada.create({
          data: {
            ...scopedByTenantCompany(scope),
            codigo,
            pedidoVendaId,
            status: "PENDENTE",
            itens: { create: itensCreate }
          }
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

const RETIRADA_INCLUDE = {
  itens: { include: { produto: { select: { nome: true, sku: true } } } },
  pedidoVenda: {
    include: {
      cliente: { select: { razaoSocial: true, nomeFantasia: true, documento: true } },
      itens: { select: { produtoId: true, quantidade: true } },
      notasFiscais: {
        where: { status: "AUTORIZADA" as const, finalidade: "NORMAL" as const },
        select: { numero: true, modelo: true }
      }
    }
  }
} satisfies Prisma.ExpedicaoRetiradaInclude;

type RetiradaCompleta = Prisma.ExpedicaoRetiradaGetPayload<{ include: typeof RETIRADA_INCLUDE }>;

/** Retiradas criadas antes do controle por item não têm itens — gera a partir do pedido. */
async function ensureItensRetirada(scope: TenantScope, retirada: RetiradaCompleta): Promise<RetiradaCompleta> {
  if (retirada.itens.length > 0) return retirada;
  await prisma.expedicaoRetiradaItem.createMany({
    data: Array.from(quantidadesPorProduto(retirada.pedidoVenda.itens).entries()).map(([produtoId, quantidade]) => ({
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      retiradaId: retirada.id,
      produtoId,
      quantidade,
      // Retirada antiga já ENTREGUE foi baixada por inteiro.
      entregue: retirada.status === "ENTREGUE" ? quantidade : 0
    })),
    skipDuplicates: true
  });
  const recarregada = await prisma.expedicaoRetirada.findUnique({ where: { id: retirada.id }, include: RETIRADA_INCLUDE });
  return recarregada ?? retirada;
}

/** Consulta por código (conferência do recibo na expedição). */
export async function consultarRetirada(scope: TenantScope, codigoInformado: string): Promise<RetiradaCompleta> {
  await assertExpedicaoHabilitada(scope);
  const codigo = normalizarCodigo(codigoInformado);
  if (!codigo) throw new ExpedicaoError("Informe o código do recibo.");

  const retirada = await prisma.expedicaoRetirada.findFirst({
    where: { ...scopedByTenantCompany(scope), codigo },
    include: RETIRADA_INCLUDE
  });
  if (!retirada) {
    throw new ExpedicaoError("Recibo não encontrado — confira o código. Este recibo pode não ser desta loja.");
  }
  return ensureItensRetirada(scope, retirada);
}

export type EntregaItemInput = { produtoId: string; quantidade: number };

/**
 * Confirma uma entrega (total ou parcial). Sem itens informados, entrega todo o restante.
 * Completou tudo → retirada ENTREGUE e pedido ENTREGUE; senão → PARCIAL (o recibo segue
 * valendo para o saldo).
 */
export async function confirmarEntregaRetirada(
  scope: TenantScope,
  codigoInformado: string,
  input: { conferente: string; observacoes?: string; itens?: EntregaItemInput[] }
) {
  const conferente = input.conferente?.trim();
  if (!conferente) throw new ExpedicaoError("Informe o nome de quem está entregando (conferente).");

  const retirada = await consultarRetirada(scope, codigoInformado);
  if (retirada.status === "ENTREGUE") {
    throw new ExpedicaoError(
      `Este recibo JÁ FOI ENTREGUE por completo em ${retirada.entregueEm?.toLocaleString("pt-BR") ?? ""} por ${retirada.entreguePor ?? "?"}. Não entregue novamente.`
    );
  }
  if (retirada.status === "CANCELADA") {
    throw new ExpedicaoError("Esta retirada foi cancelada (venda cancelada/devolvida). Não entregue a mercadoria.");
  }

  // Quantidades a entregar agora: as informadas, ou tudo o que resta.
  const restantePorProduto = new Map(retirada.itens.map((i) => [i.produtoId, i.quantidade - i.entregue]));
  let entregas: EntregaItemInput[];
  if (input.itens && input.itens.length > 0) {
    entregas = input.itens
      .map((i) => ({ produtoId: i.produtoId, quantidade: Math.floor(Number(i.quantidade)) }))
      .filter((i) => i.quantidade !== 0);
  } else {
    entregas = retirada.itens
      .map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade - i.entregue }))
      .filter((i) => i.quantidade > 0);
  }
  if (entregas.length === 0) throw new ExpedicaoError("Informe a quantidade de ao menos um item para entregar.");

  for (const entrega of entregas) {
    const item = retirada.itens.find((i) => i.produtoId === entrega.produtoId);
    if (!item) throw new ExpedicaoError("Item informado não pertence a esta retirada.");
    const restante = restantePorProduto.get(entrega.produtoId) ?? 0;
    if (entrega.quantidade < 0) throw new ExpedicaoError("Quantidade a entregar não pode ser negativa.");
    if (entrega.quantidade > restante) {
      throw new ExpedicaoError(
        `"${item.produto.nome}": quantidade a entregar (${entrega.quantidade}) maior que o restante (${restante}).`
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    for (const entrega of entregas) {
      await tx.expedicaoRetiradaItem.updateMany({
        where: { retiradaId: retirada.id, produtoId: entrega.produtoId },
        data: { entregue: { increment: entrega.quantidade } }
      });
    }

    const itensAtuais = await tx.expedicaoRetiradaItem.findMany({ where: { retiradaId: retirada.id } });
    const completo = itensAtuais.every((i) => i.entregue >= i.quantidade);

    // Histórico legível direto na retirada (auditoria guarda o payload completo).
    const nomesPorProduto = new Map(retirada.itens.map((i) => [i.produtoId, i.produto.sku]));
    const resumoEntrega = entregas.map((e) => `${e.quantidade}x ${nomesPorProduto.get(e.produtoId) ?? e.produtoId}`).join(", ");
    const linhaHistorico = `${new Date().toLocaleString("pt-BR")} — ${conferente} entregou: ${resumoEntrega}.${input.observacoes?.trim() ? ` Obs: ${input.observacoes.trim()}.` : ""}`;

    const atualizada = await tx.expedicaoRetirada.update({
      where: { id: retirada.id },
      data: {
        status: completo ? "ENTREGUE" : "PARCIAL",
        entreguePor: conferente,
        entregueEm: new Date(),
        observacoes: [retirada.observacoes, linhaHistorico].filter(Boolean).join("\n")
      }
    });

    // Tudo nas mãos do cliente: pedido vai para ENTREGUE (estado final do fluxo feliz).
    if (completo && retirada.pedidoVenda.status !== "CANCELADO") {
      await tx.pedidoVenda.update({
        where: { id: retirada.pedidoVendaId },
        data: { status: "ENTREGUE" }
      });
    }

    await createAuditLog(tx, {
      scope,
      entidade: "ExpedicaoRetirada",
      entidadeId: retirada.id,
      acao: completo ? "ENTREGAR" : "ENTREGAR_PARCIAL",
      payload: { codigo: retirada.codigo, pedido: retirada.pedidoVenda.numero, conferente, itens: entregas, completo }
    });

    return { retirada: atualizada, completo };
  });
}

/** Retiradas em aberto (fila da expedição) — pendentes e parciais. */
export async function listRetiradasPendentes(scope: TenantScope) {
  return prisma.expedicaoRetirada.findMany({
    where: { ...scopedByTenantCompany(scope), status: { in: ["PENDENTE", "PARCIAL"] } },
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

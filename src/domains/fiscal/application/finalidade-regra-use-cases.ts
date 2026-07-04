/**
 * Resolução e CRUD das regras De/Para de finalidade de itens em NF-e de entrada.
 *
 * A ordem de precedência ao classificar um item na importação é:
 *   1. ProdutoFiscal.finalidadePadrao — finalidade memorizada do produto já vinculado;
 *   2. RegraFinalidadeEntrada — regra configurável por fornecedor > CFOP de origem > NCM;
 *   3. heurística pura (sugerirFinalidadeEntrada).
 *
 * As matrizes de CFOP/crédito ficam em finalidade-entrada.ts; aqui só mapeamos
 * (NCM/CFOP/fornecedor) -> finalidade e expomos o CRUD da tabela.
 */

import type { FinalidadeEntrada, Prisma, RegraFinalidadeEntrada } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { isFinalidadeEntrada, sugerirFinalidadeEntrada } from "@/domains/fiscal/finalidade-entrada";

export type FinalidadeOrigem = "PRODUTO_FISCAL" | "DEPARA" | "HEURISTICA" | "MANUAL" | "IA";

export type FinalidadeResolvida = {
  finalidade: FinalidadeEntrada;
  origem: FinalidadeOrigem;
  confianca: number;
};

type FinalidadeMatchInput = {
  ncm?: string | null;
  cfopOrigem?: string | null;
  fornecedorId?: string | null;
};

/** Especificidade de uma regra: fornecedor (3) > CFOP (2) > NCM (1); soma com prioridade. */
function ruleScore(rule: RegraFinalidadeEntrada): number {
  let score = 0;
  if (rule.fornecedorId) score += 300;
  if (rule.cfopOrigem) score += 200;
  if (rule.ncm) score += 100;
  if (rule.empresaId) score += 50; // regra da empresa vence a global empatada
  score += rule.prioridade;
  return score;
}

/**
 * Carrega as regras De/Para vigentes do tenant/empresa (inclui globais com empresaId nulo).
 * Carregue UMA vez por documento e reutilize via pickFinalidadeRule — evita refazer esta
 * consulta por item (N itens → N queries idênticas dentro da transação de importação).
 */
export async function loadFinalidadeRules(
  client: Prisma.TransactionClient,
  scope: TenantScope,
  now: Date
): Promise<RegraFinalidadeEntrada[]> {
  return client.regraFinalidadeEntrada.findMany({
    where: {
      tenantId: scope.tenantId,
      OR: [{ empresaId: scope.empresaId }, { empresaId: null }],
      ativo: true,
      vigenciaInicio: { lte: now },
      AND: [{ OR: [{ vigenciaFim: null }, { vigenciaFim: { gte: now } }] }]
    }
  });
}

/** Escolhe, entre regras já carregadas, a mais específica aplicável ao item (ou null). Pura. */
export function pickFinalidadeRule(
  regras: RegraFinalidadeEntrada[],
  input: FinalidadeMatchInput
): RegraFinalidadeEntrada | null {
  const ncm = (input.ncm ?? "").replace(/\D/g, "") || null;
  const cfop = (input.cfopOrigem ?? "").replace(/\D/g, "") || null;

  const aplicaveis = regras.filter((rule) => {
    if (rule.fornecedorId && rule.fornecedorId !== input.fornecedorId) return false;
    if (rule.cfopOrigem && rule.cfopOrigem.replace(/\D/g, "") !== cfop) return false;
    // NCM casa por prefixo (regra "8708" cobre "87083000").
    if (rule.ncm && !(ncm && ncm.startsWith(rule.ncm.replace(/\D/g, "")))) return false;
    return true;
  });

  if (!aplicaveis.length) return null;
  return aplicaveis.sort((a, b) => ruleScore(b) - ruleScore(a))[0];
}

/** Casa o item contra as regras De/Para vigentes; devolve a mais específica ou null. */
export async function matchFinalidadeRule(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  input: FinalidadeMatchInput,
  now: Date
): Promise<RegraFinalidadeEntrada | null> {
  const regras = await loadFinalidadeRules(tx, scope, now);
  return pickFinalidadeRule(regras, input);
}

/**
 * Resolve a finalidade de um item aplicando a precedência completa (memória do produto →
 * regra De/Para → heurística). Sempre retorna uma finalidade (a heurística tem fallback).
 */
export async function resolveFinalidadeForItem(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  item: { ncm?: string | null; cfopOrigem?: string | null; descricao?: string | null; produtoId?: string | null },
  fornecedorId: string | null,
  now: Date,
  /** Regras De/Para já carregadas (loadFinalidadeRules). Quando ausente, são carregadas aqui.
   *  Em importações com muitos itens, carregue uma vez e passe — evita N queries idênticas. */
  regrasCache?: RegraFinalidadeEntrada[]
): Promise<FinalidadeResolvida> {
  // 1. Memória do produto já vinculado.
  if (item.produtoId) {
    const fiscal = await tx.produtoFiscal.findUnique({
      where: { produtoId: item.produtoId },
      select: { finalidadePadrao: true }
    });
    if (fiscal?.finalidadePadrao) {
      return { finalidade: fiscal.finalidadePadrao, origem: "PRODUTO_FISCAL", confianca: 1 };
    }
  }

  // 2. Regra De/Para configurável.
  const regra = regrasCache
    ? pickFinalidadeRule(regrasCache, { ncm: item.ncm, cfopOrigem: item.cfopOrigem, fornecedorId })
    : await matchFinalidadeRule(tx, scope, { ncm: item.ncm, cfopOrigem: item.cfopOrigem, fornecedorId }, now);
  if (regra) {
    return { finalidade: regra.finalidade, origem: "DEPARA", confianca: 0.9 };
  }

  // 3. Heurística pura.
  const heur = sugerirFinalidadeEntrada({ ncm: item.ncm, cfop: item.cfopOrigem, descricao: item.descricao });
  return { finalidade: heur.finalidade, origem: "HEURISTICA", confianca: heur.confianca };
}

// ─── CRUD ───────────────────────────────────────────────────────────────────────

export type RegraFinalidadePayload = {
  nome?: string;
  finalidade?: string;
  ncm?: string;
  cfopOrigem?: string;
  fornecedorId?: string;
  prioridade?: number;
  ativo?: boolean;
  vigenciaInicio?: string;
  vigenciaFim?: string;
};

function digitsOrNull(value: string | undefined): string | null {
  const d = (value ?? "").replace(/\D/g, "");
  return d || null;
}

function parseDateOrNull(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function validate(payload: RegraFinalidadePayload) {
  const nome = (payload.nome ?? "").trim();
  if (!nome) throw new Error("Informe um nome para a regra.");
  if (!isFinalidadeEntrada(payload.finalidade)) throw new Error("Finalidade inválida.");
  const ncm = digitsOrNull(payload.ncm);
  const cfopOrigem = digitsOrNull(payload.cfopOrigem);
  const fornecedorId = (payload.fornecedorId ?? "").trim() || null;
  if (!ncm && !cfopOrigem && !fornecedorId) {
    throw new Error("Defina ao menos um critério: NCM, CFOP de origem ou fornecedor.");
  }
  return {
    nome,
    finalidade: payload.finalidade as FinalidadeEntrada,
    ncm,
    cfopOrigem,
    fornecedorId,
    prioridade: Number.isFinite(payload.prioridade) ? Number(payload.prioridade) : 100,
    ativo: typeof payload.ativo === "boolean" ? payload.ativo : true,
    vigenciaInicio: parseDateOrNull(payload.vigenciaInicio) ?? new Date(),
    vigenciaFim: parseDateOrNull(payload.vigenciaFim)
  };
}

export async function listRegrasFinalidade(scope: TenantScope) {
  return prisma.regraFinalidadeEntrada.findMany({
    where: { tenantId: scope.tenantId, OR: [{ empresaId: scope.empresaId }, { empresaId: null }] },
    orderBy: [{ ativo: "desc" }, { prioridade: "desc" }, { criadoEm: "desc" }]
  });
}

export async function createRegraFinalidade(scope: TenantScope, payload: RegraFinalidadePayload) {
  const data = validate(payload);
  // Duplicata: mesma combinação de critérios (NCM+CFOP+fornecedor+finalidade) já ativa.
  const duplicada = await prisma.regraFinalidadeEntrada.findFirst({
    where: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      ativo: true,
      finalidade: data.finalidade,
      ncm: data.ncm,
      cfopOrigem: data.cfopOrigem,
      fornecedorId: data.fornecedorId
    },
    select: { nome: true }
  });
  if (duplicada) {
    throw new Error(`Já existe uma regra ativa com os mesmos critérios ("${duplicada.nome}"). Edite ou desative a existente.`);
  }
  const regra = await prisma.regraFinalidadeEntrada.create({
    data: { tenantId: scope.tenantId, empresaId: scope.empresaId, ...data }
  });
  await createAuditLog(prisma, {
    scope,
    entidade: "RegraFinalidadeEntrada",
    entidadeId: regra.id,
    acao: "CREATE",
    payload: { nome: regra.nome, finalidade: regra.finalidade }
  });
  return regra;
}

export async function updateRegraFinalidade(scope: TenantScope, id: string, payload: RegraFinalidadePayload) {
  const existente = await prisma.regraFinalidadeEntrada.findFirst({
    where: { id, tenantId: scope.tenantId, OR: [{ empresaId: scope.empresaId }, { empresaId: null }] }
  });
  if (!existente) throw new Error("Regra não encontrada.");
  const data = validate(payload);
  const regra = await prisma.regraFinalidadeEntrada.update({ where: { id }, data });
  await createAuditLog(prisma, {
    scope,
    entidade: "RegraFinalidadeEntrada",
    entidadeId: regra.id,
    acao: "UPDATE",
    payload: { nome: regra.nome, finalidade: regra.finalidade }
  });
  return regra;
}

export async function archiveRegraFinalidade(scope: TenantScope, id: string) {
  const existente = await prisma.regraFinalidadeEntrada.findFirst({
    where: { id, tenantId: scope.tenantId, OR: [{ empresaId: scope.empresaId }, { empresaId: null }] }
  });
  if (!existente) throw new Error("Regra não encontrada.");
  const regra = await prisma.regraFinalidadeEntrada.update({ where: { id }, data: { ativo: false } });
  await createAuditLog(prisma, {
    scope,
    entidade: "RegraFinalidadeEntrada",
    entidadeId: regra.id,
    acao: "ARCHIVE",
    payload: { nome: regra.nome }
  });
  return regra;
}

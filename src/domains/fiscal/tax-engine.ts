import type { Prisma, RegimeTributario, RegraTributaria, TipoTributo } from "@prisma/client";
import type { TenantScope } from "@/lib/auth/dev-session";
import type { ItemTaxResult, NormalizedFiscalItem } from "./types";

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function num(value: Prisma.Decimal | number | null | undefined) {
  return value === null || value === undefined ? 0 : Number(value);
}

/**
 * Pontuação de especificidade de uma regra: regras com NCM e UF destino preenchidos
 * vencem regras genéricas. Permite herdar uma regra global da empresa quando não há
 * regra específica para o NCM/UF.
 */
function ruleScore(rule: RegraTributaria, ncm: string | null, ufDestino: string | null) {
  let score = 0;
  if (rule.ncm && ncm && rule.ncm === ncm) score += 8;
  if (rule.ncm && (!ncm || rule.ncm !== ncm)) return -1; // regra exige NCM diferente
  if (rule.ufDestino && ufDestino && rule.ufDestino === ufDestino) score += 4;
  if (rule.ufDestino && (!ufDestino || rule.ufDestino !== ufDestino)) return -1;
  if (rule.empresaId) score += 1; // regra da empresa vence global empatada
  return score;
}

function pickRule(
  rules: RegraTributaria[],
  tributo: TipoTributo,
  ncm: string | null,
  ufDestino: string | null
): RegraTributaria | null {
  const candidates = rules
    .filter((rule) => rule.tributo === tributo)
    .map((rule) => ({ rule, score: ruleScore(rule, ncm, ufDestino) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.rule ?? null;
}

/** CSOSN/CST padrão por regime quando não há regra cadastrada. */
function defaultIcms(regime: RegimeTributario) {
  if (regime === "SIMPLES_NACIONAL" || regime === "MEI" || regime === "SIMPLES_EXCESSO_SUBLIMITE") {
    return { csosn: "102", cst: null }; // tributada sem permissão de crédito
  }
  return { csosn: null, cst: "00" }; // tributada integralmente
}

type TaxContext = {
  regime: RegimeTributario;
  ufOrigem: string | null;
  ufDestino: string | null;
  servico: boolean;
};

/**
 * Carrega as regras tributárias de venda aplicáveis ao tenant/empresa (inclui regras
 * globais com empresaId nulo), válidas na data atual. Carregar uma vez e reutilizar
 * por documento evita N consultas por item.
 */
export async function loadSalesTaxRules(
  client: Prisma.TransactionClient,
  scope: TenantScope
): Promise<RegraTributaria[]> {
  const now = new Date();
  return client.regraTributaria.findMany({
    where: {
      tenantId: scope.tenantId,
      OR: [{ empresaId: scope.empresaId }, { empresaId: null }],
      ativo: true,
      operacao: { in: ["VENDA", "DEVOLUCAO_COMPRA"] },
      vigenciaInicio: { lte: now },
      AND: [{ OR: [{ vigenciaFim: null }, { vigenciaFim: { gte: now } }] }]
    }
  });
}

/**
 * Calcula os tributos de um item a partir das regras cadastradas. Sem regra para um
 * tributo, aplica padrão coerente com o regime (Simples → CSOSN 102 / PIS/COFINS zerados
 * no documento; Lucro → CST com alíquotas da regra). Determinístico e auditável.
 */
export function computeItemTaxes(
  item: NormalizedFiscalItem,
  rules: RegraTributaria[],
  ctx: TaxContext
): ItemTaxResult {
  const base = round2(Math.max(item.valorTotal - item.desconto, 0));
  const origem = item.origem ?? "0";

  if (ctx.servico) {
    const issRule = pickRule(rules, "ISS", item.ncm, ctx.ufDestino);
    const aliquotaIss = num(issRule?.aliquota);
    return {
      origem,
      cstIcms: null,
      csosn: null,
      baseIcms: 0,
      aliquotaIcms: 0,
      valorIcms: 0,
      cstIpi: null,
      aliquotaIpi: 0,
      valorIpi: 0,
      cstPis: null,
      aliquotaPis: 0,
      valorPis: 0,
      cstCofins: null,
      aliquotaCofins: 0,
      valorCofins: 0,
      itemListaServico: item.itemListaServico,
      aliquotaIss,
      valorIss: round2(base * (aliquotaIss / 100)),
      cClassTrib: issRule?.cClassTrib ?? null
    };
  }

  const icmsRule = pickRule(rules, "ICMS", item.ncm, ctx.ufDestino);
  const ipiRule = pickRule(rules, "IPI", item.ncm, ctx.ufDestino);
  const pisRule = pickRule(rules, "PIS", item.ncm, ctx.ufDestino);
  const cofinsRule = pickRule(rules, "COFINS", item.ncm, ctx.ufDestino);

  const fallbackIcms = defaultIcms(ctx.regime);
  const aliquotaIcms = num(icmsRule?.aliquota);
  const reducao = num(icmsRule?.reducaoBase) / 100;
  const baseIcms = round2(base * (1 - reducao));
  const isSimples = ctx.regime === "SIMPLES_NACIONAL" || ctx.regime === "MEI" || ctx.regime === "SIMPLES_EXCESSO_SUBLIMITE";

  const aliquotaIpi = num(ipiRule?.aliquota);
  const aliquotaPis = num(pisRule?.aliquota);
  const aliquotaCofins = num(cofinsRule?.aliquota);

  return {
    origem,
    cstIcms: icmsRule?.cst ?? (isSimples ? null : fallbackIcms.cst),
    csosn: icmsRule?.csosn ?? (isSimples ? fallbackIcms.csosn : null),
    baseIcms: isSimples && !icmsRule ? 0 : baseIcms,
    aliquotaIcms,
    valorIcms: isSimples && !icmsRule ? 0 : round2(baseIcms * (aliquotaIcms / 100)),
    cstIpi: ipiRule?.cst ?? (ipiRule ? null : "53"),
    aliquotaIpi,
    valorIpi: round2(base * (aliquotaIpi / 100)),
    cstPis: pisRule?.cst ?? (isSimples ? "49" : "01"),
    aliquotaPis,
    valorPis: round2(base * (aliquotaPis / 100)),
    cstCofins: cofinsRule?.cst ?? (isSimples ? "49" : "01"),
    aliquotaCofins,
    valorCofins: round2(base * (aliquotaCofins / 100)),
    itemListaServico: null,
    aliquotaIss: 0,
    valorIss: 0,
    cClassTrib: icmsRule?.cClassTrib ?? null
  };
}

export type DocumentTaxTotals = {
  valorProdutos: number;
  valorServicos: number;
  valorDesconto: number;
  valorIcms: number;
  valorIpi: number;
  valorPis: number;
  valorCofins: number;
  valorIss: number;
  valorTotalTributos: number;
};

export function emptyTotals(): DocumentTaxTotals {
  return {
    valorProdutos: 0,
    valorServicos: 0,
    valorDesconto: 0,
    valorIcms: 0,
    valorIpi: 0,
    valorPis: 0,
    valorCofins: 0,
    valorIss: 0,
    valorTotalTributos: 0
  };
}

export function accumulateTotals(totals: DocumentTaxTotals, item: NormalizedFiscalItem, taxes: ItemTaxResult) {
  if (item.servico) {
    totals.valorServicos = round2(totals.valorServicos + item.valorTotal);
  } else {
    totals.valorProdutos = round2(totals.valorProdutos + item.valorTotal);
  }
  totals.valorDesconto = round2(totals.valorDesconto + item.desconto);
  totals.valorIcms = round2(totals.valorIcms + taxes.valorIcms);
  totals.valorIpi = round2(totals.valorIpi + taxes.valorIpi);
  totals.valorPis = round2(totals.valorPis + taxes.valorPis);
  totals.valorCofins = round2(totals.valorCofins + taxes.valorCofins);
  totals.valorIss = round2(totals.valorIss + taxes.valorIss);
  totals.valorTotalTributos = round2(
    totals.valorIcms + totals.valorIpi + totals.valorPis + totals.valorCofins + totals.valorIss
  );
  return totals;
}

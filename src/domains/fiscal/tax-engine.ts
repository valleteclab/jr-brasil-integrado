import type { Prisma, RegimeTributario, RegraTributaria, TipoTributo } from "@prisma/client";
import type { TenantScope } from "@/lib/auth/dev-session";
import type { ItemTaxResult, NormalizedFiscalItem } from "./types";
import { aliquotaIcmsVendaSafe, aliquotaInternaIcmsSafe, fcpInterno, pisCofinsBaseline, reformaBaseline } from "./national-tax-baseline";

/** Zera os campos de FCP/ICMS-ST de um resultado (operações sem ST/FCP). */
const SEM_ST_FCP = {
  percentualFcp: 0,
  valorFcp: 0,
  modalidadeBcSt: null as string | null,
  percentualMva: 0,
  baseIcmsSt: 0,
  aliquotaIcmsSt: 0,
  valorIcmsSt: 0
};

function somaTributos(parts: number[]): number {
  return round2(parts.reduce((total, value) => total + value, 0));
}

/**
 * Calcula ICMS-ST por MVA quando a regra define `mva`. Não recalcula para mercadoria já
 * substituída (CSOSN 500 / CST 60). Base ST = (base própria + IPI) × (1 + MVA); ST = base ST ×
 * alíquota interna do destino − ICMS próprio.
 */
function computeIcmsSt(
  rule: RegraTributaria | null,
  csosn: string | null,
  cstIcms: string | null,
  baseProprio: number,
  valorIpi: number,
  valorIcmsProprio: number,
  ufDestino: string | null
) {
  const mva = rule?.mva != null ? Number(rule.mva) : 0;
  const substituido = csosn === "500" || cstIcms === "60";
  if (!mva || substituido) {
    return { modalidadeBcSt: null as string | null, percentualMva: 0, baseIcmsSt: 0, aliquotaIcmsSt: 0, valorIcmsSt: 0 };
  }
  const baseSt = round2((baseProprio + valorIpi) * (1 + mva / 100));
  const aliqSt = rule?.aliquotaIcmsSt != null ? Number(rule.aliquotaIcmsSt) : aliquotaInternaIcmsSafe(ufDestino);
  const valorSt = Math.max(round2(baseSt * (aliqSt / 100) - valorIcmsProprio), 0);
  return { modalidadeBcSt: "MVA", percentualMva: mva, baseIcmsSt: baseSt, aliquotaIcmsSt: aliqSt, valorIcmsSt: valorSt };
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Reforma Tributária (IBS/CBS/IS): calcula os valores sobre a base da operação. Regra cadastrada
 * (por NCM/UF) vence; sem regra, usa a base nacional de teste (CBS 0,9% / IBS 0,1% / IS 0%).
 * A redução de base (quando houver) vem da regra de CBS/IBS (reducaoBase). IS incide sobre o
 * valor cheio. Resultado informativo — exibido no espelho; ainda não enviado no XML em 2026.
 */
function computeReforma(
  rules: RegraTributaria[],
  ncm: string | null,
  ufDestino: string | null,
  base: number
) {
  const ibsRule = pickRule(rules, "IBS", ncm, ufDestino);
  const cbsRule = pickRule(rules, "CBS", ncm, ufDestino);
  const isRule = pickRule(rules, "IS", ncm, ufDestino);
  const bl = reformaBaseline();
  const aliquotaIbs = ibsRule ? num(ibsRule.aliquota) : bl.ibs;
  const aliquotaCbs = cbsRule ? num(cbsRule.aliquota) : bl.cbs;
  const aliquotaIs = isRule ? num(isRule.aliquota) : bl.is;
  const reducao = num((cbsRule ?? ibsRule)?.reducaoBase) / 100;
  const baseIbsCbs = round2(base * (1 - reducao));
  return {
    baseIbsCbs,
    aliquotaIbs,
    valorIbs: round2(baseIbsCbs * (aliquotaIbs / 100)),
    aliquotaCbs,
    valorCbs: round2(baseIbsCbs * (aliquotaCbs / 100)),
    aliquotaIs,
    valorIs: round2(base * (aliquotaIs / 100))
  };
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
  // Reforma Tributária (IBS/CBS/IS) — mesma base para todos os ramos (serviço/ST/Simples/normal).
  const reforma = computeReforma(rules, item.ncm, ctx.ufDestino, base);

  if (ctx.servico) {
    const issRule = pickRule(rules, "ISS", item.ncm, ctx.ufDestino);
    // Alíquota/base de ISS informadas no item (emissão avulsa) sobrepõem a regra tributária.
    const aliquotaIss = item.aliquotaIssInformada != null ? item.aliquotaIssInformada : num(issRule?.aliquota);
    const baseIss = item.baseIssInformada != null ? round2(Math.max(item.baseIssInformada, 0)) : base;
    const valorIss = round2(baseIss * (aliquotaIss / 100));
    return {
      origem,
      cstIcms: null,
      csosn: null,
      baseIcms: 0,
      aliquotaIcms: 0,
      valorIcms: 0,
      ...SEM_ST_FCP,
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
      valorIss,
      ...reforma,
      valorTributos: valorIss,
      cClassTrib: issRule?.cClassTrib ?? null
    };
  }

  const ipiRule = pickRule(rules, "IPI", item.ncm, ctx.ufDestino);
  const pisRule = pickRule(rules, "PIS", item.ncm, ctx.ufDestino);
  const cofinsRule = pickRule(rules, "COFINS", item.ncm, ctx.ufDestino);
  const isSimples = ctx.regime === "SIMPLES_NACIONAL" || ctx.regime === "MEI" || ctx.regime === "SIMPLES_EXCESSO_SUBLIMITE";

  // Sem regra de PIS/COFINS, cai no baseline do regime (Simples = 0; Presumido 0,65/3;
  // Real 1,65/7,6) — assim o cálculo automático destaca PIS/COFINS como em outros ERPs.
  const pisCofinsFallback = pisCofinsBaseline(ctx.regime);
  const aliquotaIpi = num(ipiRule?.aliquota);
  const aliquotaPis = pisRule ? num(pisRule.aliquota) : pisCofinsFallback.pis;
  const aliquotaCofins = cofinsRule ? num(cofinsRule.aliquota) : pisCofinsFallback.cofins;

  // Mercadoria substituída (ICMS-ST já recolhido na cadeia): a saída NÃO tem ICMS próprio nem
  // novo ICMS-ST. Sai com CSOSN 500 (Simples) ou CST 60 (regime normal) — o que faz a emissão
  // derivar o CFOP de ST (5405/6404). IPI/PIS/COFINS seguem o cálculo normal do regime.
  if (item.icmsSt) {
    const valorIpi = round2(base * (aliquotaIpi / 100));
    const valorPis = round2(base * (aliquotaPis / 100));
    const valorCofins = round2(base * (aliquotaCofins / 100));
    return {
      origem,
      cstIcms: isSimples ? null : "60",
      csosn: isSimples ? "500" : null,
      baseIcms: 0,
      aliquotaIcms: 0,
      valorIcms: 0,
      ...SEM_ST_FCP,
      cstIpi: ipiRule?.cst ?? (ipiRule ? null : "53"),
      aliquotaIpi,
      valorIpi,
      cstPis: pisRule?.cst ?? (isSimples ? "49" : "01"),
      aliquotaPis,
      valorPis,
      cstCofins: cofinsRule?.cst ?? (isSimples ? "49" : "01"),
      aliquotaCofins,
      valorCofins,
      itemListaServico: null,
      aliquotaIss: 0,
      valorIss: 0,
      ...reforma,
      valorTributos: somaTributos([valorIpi, valorPis, valorCofins]),
      cClassTrib: null
    };
  }

  // No Simples Nacional não há destaque de ICMS próprio na nota (recolhido no DAS): usa-se
  // CSOSN e valores zerados, ignorando regras de regime normal (CST) eventualmente cadastradas.
  if (isSimples) {
    const icmsRuleSimples = pickRule(rules, "ICMS", item.ncm, ctx.ufDestino);
    const csosn = icmsRuleSimples?.csosn ?? defaultIcms(ctx.regime).csosn;
    const valorIpi = round2(base * (aliquotaIpi / 100));
    const valorPis = round2(base * (aliquotaPis / 100));
    const valorCofins = round2(base * (aliquotaCofins / 100));
    // No Simples o substituto tributário (CSOSN 201/202) ainda destaca ICMS-ST quando há MVA.
    const st = computeIcmsSt(icmsRuleSimples, csosn, null, base, valorIpi, 0, ctx.ufDestino);
    return {
      origem,
      cstIcms: null,
      csosn,
      baseIcms: 0,
      aliquotaIcms: 0,
      valorIcms: 0,
      percentualFcp: 0,
      valorFcp: 0,
      ...st,
      cstIpi: ipiRule?.cst ?? (ipiRule ? null : "53"),
      aliquotaIpi,
      valorIpi,
      cstPis: pisRule?.cst ?? "49",
      aliquotaPis,
      valorPis,
      cstCofins: cofinsRule?.cst ?? "49",
      aliquotaCofins,
      valorCofins,
      itemListaServico: null,
      aliquotaIss: 0,
      valorIss: 0,
      ...reforma,
      valorTributos: somaTributos([valorIpi, valorPis, valorCofins, st.valorIcmsSt]),
      cClassTrib: icmsRuleSimples?.cClassTrib ?? null
    };
  }

  // Regime normal (Lucro Presumido/Real): ICMS destacado por CST com a alíquota da regra.
  const icmsRule = pickRule(rules, "ICMS", item.ncm, ctx.ufDestino);
  const fallbackIcms = defaultIcms(ctx.regime);
  const cstIcms = icmsRule?.cst ?? fallbackIcms.cst;
  // Sem regra específica, o CST padrão é 00 (tributada integralmente) — então a alíquota NÃO
  // pode ser 0. Cai na base nacional (interna/interestadual) pela UF de origem/destino, igual ao
  // "cálculo automático" de outros ERPs. Uma regra cadastrada (mesmo com 0%) sempre prevalece.
  // Passa a origem do item: produto importado (origem 1/2/3/8) em operação interestadual usa 4%
  // (Res. SF 13/2012); a base nacional resolve isso quando não há regra específica cadastrada.
  const aliquotaIcms = icmsRule ? num(icmsRule.aliquota) : aliquotaIcmsVendaSafe(ctx.ufOrigem, ctx.ufDestino, origem);
  const reducao = num(icmsRule?.reducaoBase) / 100;
  const baseIcms = round2(base * (1 - reducao));
  const valorIcms = round2(baseIcms * (aliquotaIcms / 100));
  const valorIpi = round2(base * (aliquotaIpi / 100));
  const valorPis = round2(base * (aliquotaPis / 100));
  const valorCofins = round2(base * (aliquotaCofins / 100));
  // FCP destacado em operação interna (mesma UF) para regime normal, da regra ou da tabela por UF.
  const interna = Boolean(ctx.ufOrigem && ctx.ufDestino && ctx.ufOrigem === ctx.ufDestino);
  const percentualFcp = icmsRule?.fcp != null ? num(icmsRule.fcp) : interna ? fcpInterno(ctx.ufDestino) : 0;
  const valorFcp = round2(baseIcms * (percentualFcp / 100));
  const st = computeIcmsSt(icmsRule, null, cstIcms, base, valorIpi, valorIcms, ctx.ufDestino);

  return {
    origem,
    cstIcms,
    csosn: null,
    baseIcms,
    aliquotaIcms,
    valorIcms,
    percentualFcp,
    valorFcp,
    ...st,
    cstIpi: ipiRule?.cst ?? (ipiRule ? null : "53"),
    aliquotaIpi,
    valorIpi,
    cstPis: pisRule?.cst ?? "01",
    aliquotaPis,
    valorPis,
    cstCofins: cofinsRule?.cst ?? "01",
    aliquotaCofins,
    valorCofins,
    itemListaServico: null,
    aliquotaIss: 0,
    valorIss: 0,
    ...reforma,
    valorTributos: somaTributos([valorIcms, valorFcp, st.valorIcmsSt, valorIpi, valorPis, valorCofins]),
    cClassTrib: icmsRule?.cClassTrib ?? null
  };
}

export type DocumentTaxTotals = {
  valorProdutos: number;
  valorServicos: number;
  valorDesconto: number;
  valorIcms: number;
  valorIcmsSt: number;
  valorFcp: number;
  valorIpi: number;
  valorPis: number;
  valorCofins: number;
  valorIss: number;
  valorIbs: number;
  valorCbs: number;
  valorIs: number;
  valorTotalTributos: number;
};

export function emptyTotals(): DocumentTaxTotals {
  return {
    valorProdutos: 0,
    valorServicos: 0,
    valorDesconto: 0,
    valorIcms: 0,
    valorIcmsSt: 0,
    valorFcp: 0,
    valorIpi: 0,
    valorPis: 0,
    valorCofins: 0,
    valorIss: 0,
    valorIbs: 0,
    valorCbs: 0,
    valorIs: 0,
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
  totals.valorIcmsSt = round2(totals.valorIcmsSt + taxes.valorIcmsSt);
  totals.valorFcp = round2(totals.valorFcp + taxes.valorFcp);
  totals.valorIpi = round2(totals.valorIpi + taxes.valorIpi);
  totals.valorPis = round2(totals.valorPis + taxes.valorPis);
  totals.valorCofins = round2(totals.valorCofins + taxes.valorCofins);
  totals.valorIss = round2(totals.valorIss + taxes.valorIss);
  // Reforma Tributária: acumula à parte (informativo em 2026, fora do valorTotalTributos da Lei 12.741).
  totals.valorIbs = round2(totals.valorIbs + taxes.valorIbs);
  totals.valorCbs = round2(totals.valorCbs + taxes.valorCbs);
  totals.valorIs = round2(totals.valorIs + taxes.valorIs);
  totals.valorTotalTributos = round2(
    totals.valorIcms + totals.valorIcmsSt + totals.valorFcp + totals.valorIpi + totals.valorPis + totals.valorCofins + totals.valorIss
  );
  return totals;
}

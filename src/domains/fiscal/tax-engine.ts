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
 * Calcula ICMS-ST por MVA quando a regra define `mva` (Convênio ICMS 142/2018):
 *  - Base ST = (base própria + frete/encargos já embutidos + IPI) × (1 + MVA) — cláusula 11ª;
 *  - ST devido = Base ST × alíquota interna do destino − dedução da operação própria — cláusula 13ª
 *    (para remetente do SIMPLES a dedução é a alíquota INTERESTADUAL sobre a base própria, §1º);
 *  - A `mva` cadastrada na RegraTributaria é sempre a MVA ORIGINAL. Remetente do Simples usa a
 *    original mesmo interestadual (cláusula 11ª §1º); regime normal interestadual usa a MVA
 *    AJUSTADA, calculada aqui: [(1+MVA)×(1−aliqInter)/(1−aliqInternaDestino)]−1.
 * Não recalcula para mercadoria já substituída (CSOSN 500 / CST 60) — quem decide reabrir o ST na
 * interestadual (remetente vira substituto de novo) é o computeItemTaxes, trocando o CSOSN/CST.
 */
function computeIcmsSt(
  rule: RegraTributaria | null,
  csosn: string | null,
  cstIcms: string | null,
  baseProprio: number,
  valorIpi: number,
  deducaoOperacaoPropria: number,
  ufDestino: string | null,
  opts?: { ajustarMva?: boolean; aliquotaInterestadual?: number }
) {
  const mvaOriginal = rule?.mva != null ? Number(rule.mva) : 0;
  const substituido = csosn === "500" || cstIcms === "60";
  if (!mvaOriginal || substituido) {
    return { modalidadeBcSt: null as string | null, percentualMva: 0, baseIcmsSt: 0, aliquotaIcmsSt: 0, valorIcmsSt: 0 };
  }
  const aliqSt = rule?.aliquotaIcmsSt != null ? Number(rule.aliquotaIcmsSt) : aliquotaInternaIcmsSafe(ufDestino);
  // MVA ajustada (regime normal, interestadual): compensa a diferença entre a alíquota
  // interestadual e a interna do destino. Só ajusta quando o resultado é maior (aliqInter < aliqSt).
  let mva = mvaOriginal;
  if (opts?.ajustarMva && opts.aliquotaInterestadual != null && opts.aliquotaInterestadual < aliqSt) {
    mva = round2((((1 + mvaOriginal / 100) * (1 - opts.aliquotaInterestadual / 100)) / (1 - aliqSt / 100) - 1) * 100);
  }
  const baseSt = round2((baseProprio + valorIpi) * (1 + mva / 100));
  const valorSt = Math.max(round2(baseSt * (aliqSt / 100) - deducaoOperacaoPropria), 0);
  return { modalidadeBcSt: "MVA", percentualMva: mva, baseIcmsSt: baseSt, aliquotaIcmsSt: aliqSt, valorIcmsSt: valorSt };
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Quando o item REALMENTE recolhe ICMS-ST (substituto: valorSt>0 via MVA), promove o CST/CSOSN
 * para o código de ST correspondente, para que o XML monte o grupo ICMS10/70 (normal) ou
 * ICMSSN201/202 (Simples). Códigos que já são de ST (10/70/201/202) são mantidos. Sem ST
 * (valorSt==0) NADA muda — preserva o caminho atual (CST 00/60/40 e CSOSN 102/500/101).
 */
function promoteCstStNormal(cst: string | null): string | null {
  if (!cst) return cst;
  const c = cst.padStart(2, "0");
  if (c === "10" || c === "70") return c; // já é ST (tributada+ST / redução+ST)
  if (c === "00") return "10"; // tributada integralmente → tributada com ST
  if (c === "20") return "70"; // redução de base → redução de base com ST
  return c; // demais CST (90 genérico, etc.): mantém, o grupo ICMS90 já aceita campos ST
}

function promoteCsosnStSimples(csosn: string | null): string | null {
  if (!csosn) return csosn;
  const c = csosn.padStart(3, "0");
  if (c === "201" || c === "202") return c; // já é Simples com ST
  if (c === "101") return "201"; // com crédito → com crédito e ST
  return "202"; // 102/103/300/400 (sem crédito) → sem crédito e com ST
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
  // CST do IBS/CBS: vem da regra cadastrada (CBS prevalece sobre IBS); sem regra, "000"
  // (tributação integral). Espalhado em todos os ramos de computeItemTaxes via `...reforma`.
  const cstIbsCbs = (cbsRule ?? ibsRule)?.cst ?? "000";
  return {
    baseIbsCbs,
    aliquotaIbs,
    valorIbs: round2(baseIbsCbs * (aliquotaIbs / 100)),
    aliquotaCbs,
    valorCbs: round2(baseIbsCbs * (aliquotaCbs / 100)),
    aliquotaIs,
    valorIs: round2(base * (aliquotaIs / 100)),
    cstIbsCbs
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

export function pickRule(
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

  const interestadual = Boolean(ctx.ufOrigem && ctx.ufDestino && ctx.ufOrigem !== ctx.ufDestino);
  // Mercadoria substituída em VENDA INTERESTADUAL: o ST retido na compra só vale para operações
  // internas — havendo protocolo/convênio com a UF de destino (= RegraTributaria de ICMS com MVA
  // para o NCM+UF), o REMETENTE volta a ser substituto (Conv. 142/2018): a nota NÃO sai CSOSN
  // 500/CST 60, sai 201/202 (ou CST 10) com novo ICMS-ST calculado. Sem regra cadastrada para o
  // destino, mantém o comportamento substituído (500/60 + CFOP 6404).
  const regraStDestino = item.icmsSt && interestadual ? pickRule(rules, "ICMS", item.ncm, ctx.ufDestino) : null;
  const reabreStInterestadual = Boolean(regraStDestino?.mva != null && Number(regraStDestino.mva) > 0 && regraStDestino?.ufDestino);

  // Mercadoria substituída (ICMS-ST já recolhido na cadeia): a saída NÃO tem ICMS próprio nem
  // novo ICMS-ST. Sai com CSOSN 500 (Simples) ou CST 60 (regime normal) — o que faz a emissão
  // derivar o CFOP de ST (5405/6404). IPI/PIS/COFINS seguem o cálculo normal do regime.
  if (item.icmsSt && !reabreStInterestadual) {
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
    // Dedução da operação própria (Conv. 142/2018 cl. 13ª §1º, remetente Simples): o resultado da
    // alíquota INTERESTADUAL sobre a base própria (interna: alíquota interna da UF), mesmo sem
    // destaque de ICMS na nota. MVA usada é sempre a ORIGINAL (cl. 11ª §1º).
    const aliqDeducaoSimples = interestadual
      ? aliquotaIcmsVendaSafe(ctx.ufOrigem, ctx.ufDestino, origem)
      : aliquotaInternaIcmsSafe(ctx.ufDestino);
    const deducaoSimples = round2(base * (aliqDeducaoSimples / 100));
    const st = computeIcmsSt(icmsRuleSimples, csosn, null, base, valorIpi, deducaoSimples, ctx.ufDestino);
    // Só quando há ST efetivo (valorSt>0) promovemos o CSOSN para 201/202; sem ST, mantém 102.
    const csosnFinal = st.valorIcmsSt > 0 ? promoteCsosnStSimples(csosn) : csosn;
    return {
      origem,
      cstIcms: null,
      csosn: csosnFinal,
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
  // Regra SÓ de ST (mva/aliquotaIcmsSt preenchidas, aliquota própria vazia) não zera o ICMS
  // próprio: alíquota nula na regra cai na base nacional (interna/interestadual por UF).
  const aliquotaIcms = icmsRule?.aliquota != null ? num(icmsRule.aliquota) : aliquotaIcmsVendaSafe(ctx.ufOrigem, ctx.ufDestino, origem);
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
  // Regime normal interestadual: MVA AJUSTADA calculada a partir da original (Conv. 142/2018).
  const st = computeIcmsSt(icmsRule, null, cstIcms, base, valorIpi, valorIcms, ctx.ufDestino, {
    ajustarMva: !interna,
    aliquotaInterestadual: aliquotaIcms
  });
  // Só quando há ST efetivo (valorSt>0) promovemos o CST para 10/70 (substituto que recolhe);
  // sem ST, mantém o CST atual (00/90/40…) e o XML segue idêntico ao de hoje.
  const cstIcmsFinal = st.valorIcmsSt > 0 ? promoteCstStNormal(cstIcms) : cstIcms;

  return {
    origem,
    cstIcms: cstIcmsFinal,
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

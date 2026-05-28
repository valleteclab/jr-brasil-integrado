/**
 * Motor de cálculo fiscal brasileiro
 *
 * Suporte: ICMS (CST 00–90 / CSOSN 101–900), ICMS-ST, FCP, IPI, PIS, COFINS
 * Referência: NT 2024.001, NT 2023.001, RICMS-BA, Lei 10.637/02, Lei 10.833/03
 *
 * Ordem de cálculo por item (NF-e schema 4.0):
 *   1. Valor do produto (vProd = qty × preço unitário - desconto)
 *   2. BC ICMS  →  ICMS  →  FCP
 *   3. BC ST    →  ICMS-ST  →  FCP-ST
 *   4. IPI
 *   5. BC PIS   →  PIS
 *   6. BC COFINS →  COFINS
 *   7. vTotTrib = soma de todos os tributos (obrigatório NF-e 4.0)
 */

// ---------------------------------------------------------------------------
// Tipos de entrada
// ---------------------------------------------------------------------------

/** Regime tributário da empresa (campo CRT na NF-e). */
export type RegimeEmpresa = "SIMPLES_NACIONAL" | "SIMPLES_NACIONAL_EXCESSO" | "REGIME_NORMAL";

/** Tipo de destinatário para determinação do ICMS. */
export type TipoDestinatario = "CONTRIBUINTE_ICMS" | "CONSUMIDOR_FINAL" | "PESSOA_FISICA";

export type TaxCalculationInput = {
  // ── Contexto da operação ─────────────────────────────────────────────────
  regime: RegimeEmpresa;
  ufOrigem: string;
  ufDestino: string;
  tipoDestinatario: TipoDestinatario;

  // ── Valores monetários do item ────────────────────────────────────────────
  /** Valor bruto = quantidade × preço unitário (sem desconto). */
  valorBruto: number;
  desconto?: number;
  frete?: number;
  seguro?: number;
  outrasDespesas?: number;

  // ── ICMS Normal ───────────────────────────────────────────────────────────
  /** CST para Regime Normal (00, 10, 20, 30, 40, 41, 50, 51, 60, 70, 90). */
  icmsCST?: string;
  /** CSOSN para Simples Nacional (101, 102, 201, 202, 203, 300, 400, 500, 900). */
  icmsCSOSN?: string;
  /**
   * Modalidade de determinação da BC:
   * 0=Margem valor agregado  1=Pauta  2=Preço tabelado  3=Preço efetivo
   */
  icmsModBC?: number;
  icmsAliquota?: number;
  icmsReducaoBC?: number;

  // ── ICMS-ST (Substituição Tributária) ─────────────────────────────────────
  icmsSTModBC?: number;
  icmsSTMVA?: number;
  icmsSTReducaoBC?: number;
  icmsSTAliquota?: number;

  // ── FCP ───────────────────────────────────────────────────────────────────
  fcpAliquota?: number;
  fcpSTAliquota?: number;

  // ── IPI ───────────────────────────────────────────────────────────────────
  ipiCST?: string;
  ipiAliquota?: number;

  // ── PIS ───────────────────────────────────────────────────────────────────
  pisCST?: string;
  pisAliquota?: number;

  // ── COFINS ────────────────────────────────────────────────────────────────
  cofinsCST?: string;
  cofinsAliquota?: number;
};

// ---------------------------------------------------------------------------
// Tipos de saída
// ---------------------------------------------------------------------------

export type IcmsResult = {
  cst?: string;
  csosn?: string;
  modalidadeBC: number;
  baseCalculo: number;
  aliquota: number;
  valor: number;
  /** True quando não há destaque na NF-e (Simples sem débito, isento etc.). */
  semDestaque: boolean;
};

export type IcmsSTResult = {
  baseCalculo: number;
  mva: number;
  aliquota: number;
  valor: number;
};

export type TributoSimples = {
  cst: string;
  baseCalculo: number;
  aliquota: number;
  valor: number;
};

export type FcpResult = {
  baseCalculo: number;
  aliquota: number;
  valor: number;
};

export type TaxCalculationResult = {
  icms: IcmsResult;
  icmsST: IcmsSTResult | null;
  fcp: FcpResult | null;
  fcpST: FcpResult | null;
  ipi: TributoSimples | null;
  pis: TributoSimples;
  cofins: TributoSimples;
  /** Soma de todos os tributos — obrigatório na NF-e 4.0 como vTotTrib. */
  totalTributos: number;
  /** Alertas para exibição ao operador sem bloquear o cálculo. */
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function pct(value?: number): number {
  return (value ?? 0) / 100;
}

/** CSTs de ICMS que geram débito na NF-e (regime normal). */
const CST_COM_DEBITO_ICMS = new Set(["00", "10", "20", "51", "70", "90"]);

/** CSTs de ICMS que têm substituição tributária. */
const CST_COM_ST = new Set(["10", "30", "70", "90"]);

/** CSOSNs do Simples Nacional que têm ST. */
const CSOSN_COM_ST = new Set(["201", "202", "203", "900"]);

/** CSTs de PIS/COFINS que geram débito (saída). */
const CST_PIS_COFINS_TRIBUTADO = new Set(["01", "02", "05"]);

/** CSTs de IPI que geram débito (saída). */
const CST_IPI_TRIBUTADO = new Set(["50", "99"]);

// ---------------------------------------------------------------------------
// Cálculo da base de ICMS (modalidade)
// ---------------------------------------------------------------------------

function calcBaseIcms(
  modBC: number,
  valorProduto: number,
  reducaoBC: number
): number {
  // Modalidade 3 = Preço efetivo (padrão para a maioria das operações)
  // Modalidades 0, 1, 2 usam a mesma lógica de vProd para simplificação;
  // pauta e preço tabelado exigem tabelas externas não disponíveis no ERP.
  const base = valorProduto;
  const reducao = pct(reducaoBC);
  return round2(base * (1 - reducao));
}

// ---------------------------------------------------------------------------
// Cálculo de ICMS-ST pelo método MVA (mais comum no Brasil)
// ---------------------------------------------------------------------------

function calcBaseIcmsST(
  bcIcmsNormal: number,
  valorIcmsNormal: number,
  mva: number,
  reducaoBaseST: number,
  aliquotaST: number
): { base: number; valor: number } {
  if (aliquotaST <= 0) {
    return { base: 0, valor: 0 };
  }

  // BC ST antes da redução = (BC normal + ICMS normal) × (1 + MVA/100)
  // Equivale a: vProd × (1 + MVA/100) quando não há redução de BC normal
  const bcBruta = round2((bcIcmsNormal + valorIcmsNormal) * (1 + pct(mva)));

  // Aplica redução de BC ST (quando houver)
  const bcST = round2(bcBruta * (1 - pct(reducaoBaseST)));

  // ICMS ST a recolher = ICMS sobre BC ST  -  ICMS já destacado no item
  const icmsSTBruto = round2(bcST * pct(aliquotaST));
  const valorST = Math.max(0, round2(icmsSTBruto - valorIcmsNormal));

  return { base: bcST, valor: valorST };
}

// ---------------------------------------------------------------------------
// Cálculo por regime tributário
// ---------------------------------------------------------------------------

function calcIcmsRegimeNormal(
  input: TaxCalculationInput,
  valorProduto: number
): { icms: IcmsResult; icmsST: IcmsSTResult | null } {
  const cst = (input.icmsCST ?? "").padStart(2, "0");
  const modBC = input.icmsModBC ?? 3;
  const aliquota = input.icmsAliquota ?? 0;
  const reducaoBC = input.icmsReducaoBC ?? 0;

  let bc = 0;
  let valor = 0;
  let semDestaque = false;
  let icmsST: IcmsSTResult | null = null;

  if (CST_COM_DEBITO_ICMS.has(cst)) {
    bc = calcBaseIcms(modBC, valorProduto, reducaoBC);
    valor = round2(bc * pct(aliquota));
  } else {
    // CST 30, 40, 41, 60: sem débito
    semDestaque = true;
    bc = 0;
    valor = 0;
  }

  if (CST_COM_ST.has(cst)) {
    const mva = input.icmsSTMVA ?? 0;
    const reducaoST = input.icmsSTReducaoBC ?? 0;
    const aliquotaST = input.icmsSTAliquota ?? 0;

    if (mva > 0 || aliquotaST > 0) {
      const st = calcBaseIcmsST(bc, valor, mva, reducaoST, aliquotaST);
      icmsST = {
        baseCalculo: st.base,
        mva,
        aliquota: aliquotaST,
        valor: st.valor
      };
    }
  }

  return {
    icms: { cst, modalidadeBC: modBC, baseCalculo: bc, aliquota, valor, semDestaque },
    icmsST
  };
}

function calcIcmsSimples(
  input: TaxCalculationInput,
  valorProduto: number
): { icms: IcmsResult; icmsST: IcmsSTResult | null } {
  const csosn = input.icmsCSOSN ?? "400";
  let icmsST: IcmsSTResult | null = null;

  // Simples Nacional: sem destaque de ICMS na NF-e para a maioria dos CSOSNs
  const icms: IcmsResult = {
    csosn,
    modalidadeBC: 3,
    baseCalculo: 0,
    aliquota: 0,
    valor: 0,
    semDestaque: true
  };

  // CSOSN 900 pode ter destaque de ICMS se a alíquota for informada
  if (csosn === "900" && (input.icmsAliquota ?? 0) > 0) {
    const reducaoBC = input.icmsReducaoBC ?? 0;
    const bc = calcBaseIcms(input.icmsModBC ?? 3, valorProduto, reducaoBC);
    icms.baseCalculo = bc;
    icms.aliquota = input.icmsAliquota!;
    icms.valor = round2(bc * pct(input.icmsAliquota));
    icms.semDestaque = false;
  }

  // Simples com ST (201, 202, 203, 900)
  if (CSOSN_COM_ST.has(csosn)) {
    const mva = input.icmsSTMVA ?? 0;
    const aliquotaST = input.icmsSTAliquota ?? 0;
    const reducaoST = input.icmsSTReducaoBC ?? 0;

    if (mva > 0 && aliquotaST > 0) {
      // Para Simples com ST, BC normal base é vProd (sem destaque de ICMS)
      const bcBase = round2(valorProduto * (1 - pct(input.icmsReducaoBC ?? 0)));
      const bcST = round2(bcBase * (1 + pct(mva)) * (1 - pct(reducaoST)));
      const valorST = round2(bcST * pct(aliquotaST));

      icmsST = {
        baseCalculo: bcST,
        mva,
        aliquota: aliquotaST,
        valor: valorST
      };
    }
  }

  return { icms, icmsST };
}

// ---------------------------------------------------------------------------
// Motor principal
// ---------------------------------------------------------------------------

export function calcularImpostos(input: TaxCalculationInput): TaxCalculationResult {
  const warnings: string[] = [];

  // Valor líquido do produto (vProd - vDesc para a base fiscal)
  const desconto = input.desconto ?? 0;
  const valorProduto = round2(Math.max(0, input.valorBruto - desconto));

  if (valorProduto <= 0) {
    warnings.push("Valor do produto é zero — os impostos serão zerados.");
  }

  // ── ICMS ─────────────────────────────────────────────────────────────────

  let icms: IcmsResult;
  let icmsST: IcmsSTResult | null;

  const isSimples = input.regime === "SIMPLES_NACIONAL" || input.regime === "SIMPLES_NACIONAL_EXCESSO";

  if (isSimples) {
    ({ icms, icmsST } = calcIcmsSimples(input, valorProduto));

    if (!input.icmsCSOSN) {
      warnings.push("CSOSN não informado para empresa no Simples Nacional. Usando 400 (sem débito).");
    }
  } else {
    ({ icms, icmsST } = calcIcmsRegimeNormal(input, valorProduto));

    if (!input.icmsCST) {
      warnings.push("CST ICMS não informado. Verifique a ficha fiscal do produto.");
    }

    if (input.icmsAliquota === undefined && CST_COM_DEBITO_ICMS.has((input.icmsCST ?? "").padStart(2, "0"))) {
      warnings.push("Alíquota ICMS não informada para CST que gera débito.");
    }
  }

  // ── FCP ──────────────────────────────────────────────────────────────────

  let fcp: FcpResult | null = null;
  let fcpST: FcpResult | null = null;

  if ((input.fcpAliquota ?? 0) > 0 && icms.baseCalculo > 0) {
    fcp = {
      baseCalculo: icms.baseCalculo,
      aliquota: input.fcpAliquota!,
      valor: round2(icms.baseCalculo * pct(input.fcpAliquota))
    };
  }

  if (icmsST && (input.fcpSTAliquota ?? 0) > 0) {
    fcpST = {
      baseCalculo: icmsST.baseCalculo,
      aliquota: input.fcpSTAliquota!,
      valor: round2(icmsST.baseCalculo * pct(input.fcpSTAliquota))
    };
  }

  // ── IPI ──────────────────────────────────────────────────────────────────

  let ipi: TributoSimples | null = null;
  const cstIpi = (input.ipiCST ?? "").padStart(2, "0");

  if (CST_IPI_TRIBUTADO.has(cstIpi) && (input.ipiAliquota ?? 0) > 0) {
    const bcIpi = valorProduto;
    ipi = {
      cst: cstIpi,
      baseCalculo: bcIpi,
      aliquota: input.ipiAliquota!,
      valor: round2(bcIpi * pct(input.ipiAliquota))
    };
  } else if (cstIpi && !CST_IPI_TRIBUTADO.has(cstIpi)) {
    // CST informado mas sem débito (isento, imune, etc.)
    ipi = {
      cst: cstIpi,
      baseCalculo: 0,
      aliquota: 0,
      valor: 0
    };
  }

  // ── PIS ──────────────────────────────────────────────────────────────────

  const cstPis = (input.pisCST ?? "07").padStart(2, "0");
  let pis: TributoSimples;

  if (CST_PIS_COFINS_TRIBUTADO.has(cstPis) && (input.pisAliquota ?? 0) > 0) {
    const bc = valorProduto;
    pis = {
      cst: cstPis,
      baseCalculo: bc,
      aliquota: input.pisAliquota!,
      valor: round2(bc * pct(input.pisAliquota))
    };
  } else {
    pis = { cst: cstPis, baseCalculo: 0, aliquota: input.pisAliquota ?? 0, valor: 0 };
  }

  // ── COFINS ───────────────────────────────────────────────────────────────

  const cstCofins = (input.cofinsCST ?? "07").padStart(2, "0");
  let cofins: TributoSimples;

  if (CST_PIS_COFINS_TRIBUTADO.has(cstCofins) && (input.cofinsAliquota ?? 0) > 0) {
    const bc = valorProduto;
    cofins = {
      cst: cstCofins,
      baseCalculo: bc,
      aliquota: input.cofinsAliquota!,
      valor: round2(bc * pct(input.cofinsAliquota))
    };
  } else {
    cofins = { cst: cstCofins, baseCalculo: 0, aliquota: input.cofinsAliquota ?? 0, valor: 0 };
  }

  // ── DIFAL (Diferencial de Alíquota) ───────────────────────────────────────
  // Operações interestaduais para consumidor final não contribuinte (EC 87/2015)
  // Implementação futura — emite alerta quando detectado
  const isInterestadual = input.ufOrigem.toUpperCase() !== input.ufDestino.toUpperCase();
  const isConsumidorFinalNaoContribuinte =
    input.tipoDestinatario === "CONSUMIDOR_FINAL" || input.tipoDestinatario === "PESSOA_FISICA";

  if (isInterestadual && isConsumidorFinalNaoContribuinte && icms.valor > 0) {
    warnings.push(
      "Operação interestadual para consumidor final: verificar DIFAL (EC 87/2015) e partilha ICMS. " +
      "Cálculo de DIFAL não está incluído neste motor — consulte seu contador."
    );
  }

  // ── Total tributos (vTotTrib — obrigatório NF-e 4.0) ─────────────────────
  const totalTributos = round2(
    icms.valor +
    (icmsST?.valor ?? 0) +
    (fcp?.valor ?? 0) +
    (fcpST?.valor ?? 0) +
    (ipi?.valor ?? 0) +
    pis.valor +
    cofins.valor
  );

  return {
    icms,
    icmsST,
    fcp,
    fcpST,
    ipi,
    pis,
    cofins,
    totalTributos,
    warnings
  };
}

// ---------------------------------------------------------------------------
// Cálculo de totais de NF-e (soma de itens)
// ---------------------------------------------------------------------------

export type NfeTotais = {
  vProd: number;
  vDesc: number;
  vFrete: number;
  vSeg: number;
  vOutro: number;
  vNF: number;
  vBC: number;
  vICMS: number;
  vBCST: number;
  vICMSST: number;
  vIPI: number;
  vPIS: number;
  vCOFINS: number;
  vFCP: number;
  vFCPST: number;
  vTotTrib: number;
};

export function somarTotaisNfe(
  itens: Array<{
    valorBruto: number;
    desconto: number;
    frete: number;
    calculo: TaxCalculationResult;
  }>
): NfeTotais {
  const totais: NfeTotais = {
    vProd: 0, vDesc: 0, vFrete: 0, vSeg: 0, vOutro: 0, vNF: 0,
    vBC: 0, vICMS: 0, vBCST: 0, vICMSST: 0,
    vIPI: 0, vPIS: 0, vCOFINS: 0,
    vFCP: 0, vFCPST: 0, vTotTrib: 0
  };

  for (const item of itens) {
    totais.vProd = round2(totais.vProd + item.valorBruto);
    totais.vDesc = round2(totais.vDesc + item.desconto);
    totais.vFrete = round2(totais.vFrete + item.frete);
    totais.vBC = round2(totais.vBC + item.calculo.icms.baseCalculo);
    totais.vICMS = round2(totais.vICMS + item.calculo.icms.valor);
    totais.vBCST = round2(totais.vBCST + (item.calculo.icmsST?.baseCalculo ?? 0));
    totais.vICMSST = round2(totais.vICMSST + (item.calculo.icmsST?.valor ?? 0));
    totais.vIPI = round2(totais.vIPI + (item.calculo.ipi?.valor ?? 0));
    totais.vPIS = round2(totais.vPIS + item.calculo.pis.valor);
    totais.vCOFINS = round2(totais.vCOFINS + item.calculo.cofins.valor);
    totais.vFCP = round2(totais.vFCP + (item.calculo.fcp?.valor ?? 0));
    totais.vFCPST = round2(totais.vFCPST + (item.calculo.fcpST?.valor ?? 0));
    totais.vTotTrib = round2(totais.vTotTrib + item.calculo.totalTributos);
  }

  totais.vNF = round2(
    totais.vProd - totais.vDesc + totais.vFrete + totais.vSeg + totais.vOutro +
    totais.vICMSST + totais.vIPI
  );

  return totais;
}

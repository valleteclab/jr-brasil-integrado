/**
 * PERCENTUAIS DE PRESUNÇÃO DO LUCRO PRESUMIDO (e da estimativa mensal do Lucro Real).
 *
 * São DADOS DE LEI (iguais para qualquer empresa/tenant), não configuração:
 *   - IRPJ: Lei 9.249/1995, art. 15, caput e § 1º;
 *   - CSLL: Lei 9.249/1995, art. 20;
 *   - construção civil: IN RFB 1.700/2017, art. 33, § 1º, II e IV, "d" — 8%/12% na empreitada
 *     TOTAL (o empreiteiro fornece todos os materiais indispensáveis, incorporados à obra) e
 *     32%/32% na empreitada parcial, por administração ou só de mão de obra;
 *   - alíquotas e adicional: Lei 9.249/1995, art. 3º (IRPJ 15% + adicional de 10% sobre o que
 *     exceder R$ 20.000,00 por mês do período) e Lei 7.689/1988 c/c Lei 9.249/1995 (CSLL 9%).
 *
 * O mesmo quadro serve ao Lucro Real que recolhe por ESTIMATIVA MENSAL com base na receita bruta
 * (Lei 9.430/1996, art. 2º) — muda a periodicidade, não os percentuais.
 */

export type TipoReceita =
  | "MERCADORIA"
  | "COMBUSTIVEL_REVENDA"
  | "OBRA_EMPREITADA_TOTAL"
  | "TRANSPORTE_CARGA"
  | "TRANSPORTE_PASSAGEIROS"
  | "SERVICO_HOSPITALAR"
  | "SERVICO_GERAL"
  | "SERVICO_GERAL_ATE_120K"
  | "OUTRAS_RECEITAS";

export type PresuncaoReceita = {
  rotulo: string;
  /** Percentual de presunção do IRPJ (fração: 0.08 = 8%). */
  irpj: number;
  /** Percentual de presunção da CSLL. */
  csll: number;
  /** Base legal, exibida na memória de cálculo. */
  base: string;
};

export const PRESUNCOES: Record<TipoReceita, PresuncaoReceita> = {
  MERCADORIA: {
    rotulo: "Venda de mercadorias / indústria",
    irpj: 0.08,
    csll: 0.12,
    base: "Lei 9.249/95, art. 15 caput e art. 20"
  },
  COMBUSTIVEL_REVENDA: {
    rotulo: "Revenda de combustível e gás natural",
    irpj: 0.016,
    csll: 0.12,
    base: "Lei 9.249/95, art. 15 § 1º I e art. 20"
  },
  OBRA_EMPREITADA_TOTAL: {
    rotulo: "Obra de construção civil — empreitada total (com material)",
    irpj: 0.08,
    csll: 0.12,
    base: "IN RFB 1.700/17, art. 33 § 1º II e IV 'd'; ADN Cosit 6/97; SC Cosit 65/2022 e 138/2023"
  },
  TRANSPORTE_CARGA: {
    rotulo: "Transporte de cargas",
    irpj: 0.08,
    csll: 0.12,
    base: "Lei 9.249/95, art. 15 § 1º II 'a' e art. 20"
  },
  TRANSPORTE_PASSAGEIROS: {
    rotulo: "Transporte (exceto cargas)",
    irpj: 0.16,
    csll: 0.12,
    base: "Lei 9.249/95, art. 15 § 1º II 'a' e art. 20"
  },
  SERVICO_HOSPITALAR: {
    rotulo: "Serviços hospitalares e afins",
    irpj: 0.08,
    csll: 0.12,
    base: "Lei 9.249/95, art. 15 § 1º III 'a' e art. 20 (exige requisitos da IN RFB 1.700/17, art. 33 § 4º)"
  },
  SERVICO_GERAL: {
    rotulo: "Serviços em geral",
    irpj: 0.32,
    csll: 0.32,
    base: "Lei 9.249/95, art. 15 § 1º III 'a' e art. 20"
  },
  SERVICO_GERAL_ATE_120K: {
    rotulo: "Serviços em geral — receita anual até R$ 120 mil",
    irpj: 0.16,
    csll: 0.32,
    base: "Lei 9.249/95, art. 15 § 4º (não se aplica a profissão regulamentada); CSLL permanece em 32%"
  },
  OUTRAS_RECEITAS: {
    rotulo: "Demais receitas e rendimentos (sem presunção)",
    irpj: 1,
    csll: 1,
    base: "Lei 9.430/96, art. 25 II e art. 29 II — entram integralmente na base"
  }
};

export const IRPJ_ALIQUOTA = 0.15;
export const IRPJ_ADICIONAL_ALIQUOTA = 0.10;
/** Limite mensal do adicional: R$ 20.000,00 por mês do período de apuração. */
export const IRPJ_ADICIONAL_LIMITE_MENSAL = 20_000;
export const CSLL_ALIQUOTA = 0.09;

/** Códigos de DARF (a conferir na emissão). */
export const DARF = { irpjPresumido: "2089", csllPresumido: "2372", irpjEstimativa: "2362", csllEstimativa: "2484" };

/**
 * Alíquotas de IRRF que os órgãos públicos aplicam por tipo de serviço (IN RFB 1.234/2012).
 * Servem de CONFERÊNCIA: quando o tomador retém 1,2% e a nota está classificada como serviço em
 * geral, ou o contrário, uma das duas classificações está errada — foi assim que um erro de
 * R$ 25 mil apareceu numa apuração real.
 */
export const IRRF_ESPERADO: Partial<Record<TipoReceita, number>> = {
  OBRA_EMPREITADA_TOTAL: 0.012,
  MERCADORIA: 0.012,
  SERVICO_GERAL: 0.048,
  SERVICO_HOSPITALAR: 0.048
};

/** Trimestre (1 a 4) de um mês (1 a 12). */
export function trimestreDoMes(mes: number): number {
  return Math.floor((mes - 1) / 3) + 1;
}

/** Primeiro e último instante do trimestre civil. */
export function periodoDoTrimestre(ano: number, trimestre: number): { inicio: Date; fim: Date; meses: number } {
  const mesInicial = (trimestre - 1) * 3;
  const inicio = new Date(Date.UTC(ano, mesInicial, 1, 0, 0, 0));
  const fim = new Date(Date.UTC(ano, mesInicial + 3, 1, 0, 0, 0));
  return { inicio, fim, meses: 3 };
}

/** Último dia útil do mês seguinte ao trimestre — vencimento da quota única (Lei 9.430/96, art. 5º). */
export function vencimentoDoTrimestre(ano: number, trimestre: number): Date {
  const mesSeguinte = trimestre * 3; // 0-based: T1 -> março(2)+1 = abril(3)
  const ultimo = new Date(Date.UTC(ano, mesSeguinte + 1, 0));
  while (ultimo.getUTCDay() === 0 || ultimo.getUTCDay() === 6) {
    ultimo.setUTCDate(ultimo.getUTCDate() - 1);
  }
  return ultimo;
}

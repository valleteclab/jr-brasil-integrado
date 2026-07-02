/**
 * TABELAS DO SIMPLES NACIONAL — LC 123/2006 com a redação da LC 155/2016 (vigente desde 2018,
 * inalterada até 2026). São DADOS DE LEI (iguais para qualquer empresa/tenant), não configuração.
 *
 * Alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) / RBT12
 * O DAS reparte a alíquota efetiva entre os tributos conforme o percentual de repartição da faixa.
 * Fonte: LC 123/2006, Anexos I a V; gov.br/receitafederal (PGDAS-D).
 */

export type FaixaSimples = {
  ate: number; // teto de RBT12 da faixa (R$)
  aliquota: number; // alíquota nominal (%)
  deducao: number; // parcela a deduzir (R$)
  /** Percentual de repartição por tributo (%) — soma 100. */
  partilha: Partial<Record<TributoSimples, number>>;
};

export type TributoSimples = "IRPJ" | "CSLL" | "COFINS" | "PIS" | "CPP" | "ICMS" | "IPI" | "ISS";

export const LIMITE_SIMPLES = 4_800_000;
export const SUBLIMITE_ICMS_ISS = 3_600_000;
/** Limite anual do MEI (LC 123 art. 18-A; valor vigente 2026). */
export const LIMITE_MEI = 81_000;

export const ANEXOS: Record<number, { nome: string; faixas: FaixaSimples[] }> = {
  1: {
    nome: "Anexo I — Comércio",
    faixas: [
      { ate: 180_000, aliquota: 4.0, deducao: 0, partilha: { IRPJ: 5.5, CSLL: 3.5, COFINS: 12.74, PIS: 2.76, CPP: 41.5, ICMS: 34 } },
      { ate: 360_000, aliquota: 7.3, deducao: 5_940, partilha: { IRPJ: 5.5, CSLL: 3.5, COFINS: 12.74, PIS: 2.76, CPP: 41.5, ICMS: 34 } },
      { ate: 720_000, aliquota: 9.5, deducao: 13_860, partilha: { IRPJ: 5.5, CSLL: 3.5, COFINS: 12.74, PIS: 2.76, CPP: 42, ICMS: 33.5 } },
      { ate: 1_800_000, aliquota: 10.7, deducao: 22_500, partilha: { IRPJ: 5.5, CSLL: 3.5, COFINS: 12.74, PIS: 2.76, CPP: 42, ICMS: 33.5 } },
      { ate: 3_600_000, aliquota: 14.3, deducao: 87_300, partilha: { IRPJ: 5.5, CSLL: 3.5, COFINS: 12.74, PIS: 2.76, CPP: 42, ICMS: 33.5 } },
      { ate: 4_800_000, aliquota: 19.0, deducao: 378_000, partilha: { IRPJ: 13.5, CSLL: 10, COFINS: 28.27, PIS: 6.13, CPP: 42.1 } }
    ]
  },
  2: {
    nome: "Anexo II — Indústria",
    faixas: [
      { ate: 180_000, aliquota: 4.5, deducao: 0, partilha: { IRPJ: 5.5, CSLL: 3.5, COFINS: 11.51, PIS: 2.49, CPP: 37.5, IPI: 7.5, ICMS: 32 } },
      { ate: 360_000, aliquota: 7.8, deducao: 5_940, partilha: { IRPJ: 5.5, CSLL: 3.5, COFINS: 11.51, PIS: 2.49, CPP: 37.5, IPI: 7.5, ICMS: 32 } },
      { ate: 720_000, aliquota: 10.0, deducao: 13_860, partilha: { IRPJ: 5.5, CSLL: 3.5, COFINS: 11.51, PIS: 2.49, CPP: 37.5, IPI: 7.5, ICMS: 32 } },
      { ate: 1_800_000, aliquota: 11.2, deducao: 22_500, partilha: { IRPJ: 5.5, CSLL: 3.5, COFINS: 11.51, PIS: 2.49, CPP: 37.5, IPI: 7.5, ICMS: 32 } },
      { ate: 3_600_000, aliquota: 14.7, deducao: 85_500, partilha: { IRPJ: 5.5, CSLL: 3.5, COFINS: 11.51, PIS: 2.49, CPP: 37.5, IPI: 7.5, ICMS: 32 } },
      { ate: 4_800_000, aliquota: 30.0, deducao: 720_000, partilha: { IRPJ: 8.5, CSLL: 7.5, COFINS: 20.96, PIS: 4.54, CPP: 23.5, IPI: 35 } }
    ]
  },
  3: {
    nome: "Anexo III — Serviços (instalação, manutenção, oficina...)",
    faixas: [
      { ate: 180_000, aliquota: 6.0, deducao: 0, partilha: { IRPJ: 4, CSLL: 3.5, COFINS: 12.82, PIS: 2.78, CPP: 43.4, ISS: 33.5 } },
      { ate: 360_000, aliquota: 11.2, deducao: 9_360, partilha: { IRPJ: 4, CSLL: 3.5, COFINS: 14.05, PIS: 3.05, CPP: 43.4, ISS: 32 } },
      { ate: 720_000, aliquota: 13.5, deducao: 17_640, partilha: { IRPJ: 4, CSLL: 3.5, COFINS: 13.64, PIS: 2.96, CPP: 43.4, ISS: 32.5 } },
      { ate: 1_800_000, aliquota: 16.0, deducao: 35_640, partilha: { IRPJ: 4, CSLL: 3.5, COFINS: 13.64, PIS: 2.96, CPP: 43.4, ISS: 32.5 } },
      { ate: 3_600_000, aliquota: 21.0, deducao: 125_640, partilha: { IRPJ: 4, CSLL: 3.5, COFINS: 12.82, PIS: 2.78, CPP: 43.4, ISS: 33.5 } },
      { ate: 4_800_000, aliquota: 33.0, deducao: 648_000, partilha: { IRPJ: 35, CSLL: 15, COFINS: 16.03, PIS: 3.47, CPP: 30.5 } }
    ]
  },
  4: {
    nome: "Anexo IV — Serviços (limpeza, obras, advocacia — CPP fora do DAS)",
    faixas: [
      { ate: 180_000, aliquota: 4.5, deducao: 0, partilha: { IRPJ: 18.8, CSLL: 15.2, COFINS: 17.67, PIS: 3.83, ISS: 44.5 } },
      { ate: 360_000, aliquota: 9.0, deducao: 8_100, partilha: { IRPJ: 19.8, CSLL: 15.2, COFINS: 20.55, PIS: 4.45, ISS: 40 } },
      { ate: 720_000, aliquota: 10.2, deducao: 12_420, partilha: { IRPJ: 20.8, CSLL: 15.2, COFINS: 19.73, PIS: 4.27, ISS: 40 } },
      { ate: 1_800_000, aliquota: 14.0, deducao: 39_780, partilha: { IRPJ: 17.8, CSLL: 19.2, COFINS: 18.9, PIS: 4.1, ISS: 40 } },
      { ate: 3_600_000, aliquota: 22.0, deducao: 183_780, partilha: { IRPJ: 18.8, CSLL: 19.2, COFINS: 18.08, PIS: 3.92, ISS: 40 } },
      { ate: 4_800_000, aliquota: 33.0, deducao: 828_000, partilha: { IRPJ: 53.5, CSLL: 21.5, COFINS: 20.55, PIS: 4.45 } }
    ]
  },
  5: {
    nome: "Anexo V — Serviços intelectuais (sujeito ao Fator R)",
    faixas: [
      { ate: 180_000, aliquota: 15.5, deducao: 0, partilha: { IRPJ: 25, CSLL: 15, COFINS: 14.1, PIS: 3.05, CPP: 28.85, ISS: 14 } },
      { ate: 360_000, aliquota: 18.0, deducao: 4_500, partilha: { IRPJ: 23, CSLL: 15, COFINS: 14.1, PIS: 3.05, CPP: 27.85, ISS: 17 } },
      { ate: 720_000, aliquota: 19.5, deducao: 9_900, partilha: { IRPJ: 24, CSLL: 15, COFINS: 14.92, PIS: 3.23, CPP: 23.85, ISS: 19 } },
      { ate: 1_800_000, aliquota: 20.5, deducao: 17_100, partilha: { IRPJ: 21, CSLL: 15, COFINS: 15.74, PIS: 3.41, CPP: 23.85, ISS: 21 } },
      { ate: 3_600_000, aliquota: 23.0, deducao: 62_100, partilha: { IRPJ: 23, CSLL: 12.5, COFINS: 14.1, PIS: 3.05, CPP: 23.85, ISS: 23.5 } },
      { ate: 4_800_000, aliquota: 30.5, deducao: 540_000, partilha: { IRPJ: 35, CSLL: 15.5, COFINS: 16.44, PIS: 3.56, CPP: 29.5 } }
    ]
  }
};

/** Faixa da tabela para o RBT12 informado. */
export function faixaDoAnexo(anexo: number, rbt12: number): { indice: number; faixa: FaixaSimples } {
  const tabela = ANEXOS[anexo];
  if (!tabela) throw new Error(`Anexo ${anexo} inválido (1 a 5).`);
  const idx = tabela.faixas.findIndex((f) => rbt12 <= f.ate);
  const indice = idx === -1 ? tabela.faixas.length - 1 : idx;
  return { indice, faixa: tabela.faixas[indice] };
}

/** Alíquota efetiva (%) da LC 123: (RBT12 × nominal − dedução) / RBT12. 1ª faixa/empresa nova: nominal. */
export function aliquotaEfetiva(anexo: number, rbt12: number): { efetiva: number; nominal: number; indiceFaixa: number } {
  const { indice, faixa } = faixaDoAnexo(anexo, rbt12);
  if (rbt12 <= 0) return { efetiva: ANEXOS[anexo].faixas[0].aliquota, nominal: ANEXOS[anexo].faixas[0].aliquota, indiceFaixa: 0 };
  const efetiva = Math.max(0, (rbt12 * (faixa.aliquota / 100) - faixa.deducao) / rbt12) * 100;
  return { efetiva: Math.round(efetiva * 10000) / 10000, nominal: faixa.aliquota, indiceFaixa: indice };
}

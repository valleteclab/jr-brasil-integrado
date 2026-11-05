/**
 * Taxa e prazo da maquininha no recebimento com cartão.
 *
 * As taxas e os prazos já eram cadastrados em Configurações → Máquinas de cartão, mas não eram
 * usados em lugar nenhum: a baixa creditava o valor BRUTO, na data de hoje. Na vida real a
 * adquirente credita o LÍQUIDO, dias depois — é daí que vem a diferença entre o sistema e o
 * extrato do banco.
 *
 * Este módulo só CALCULA. Quem decide lançar (e se lança) é a tela/caso de uso.
 */

export type ModalidadeCartao = "DEBITO" | "CREDITO";

export type TaxasMaquina = {
  taxaDebito: number;
  taxaCredito: number;
  taxaCreditoParcelado: number;
  prazoDebitoDias: number;
  prazoCreditoDias: number;
};

export type EstimativaCartao = {
  /** Percentual aplicado (ex.: 3.49 = 3,49%). */
  taxaPercent: number;
  /** Quanto a adquirente retém, em reais. */
  taxaValor: number;
  /** O que de fato cai na conta. */
  liquido: number;
  /** Dias até o crédito. */
  prazoDias: number;
  /** Data prevista do crédito. */
  previsao: Date;
};

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * Taxa aplicável: débito usa a taxa de débito; crédito à vista e parcelado têm taxas distintas,
 * porque a adquirente cobra mais caro quando parcela.
 */
export function taxaAplicavel(maquina: TaxasMaquina, modalidade: ModalidadeCartao, parcelas: number): number {
  if (modalidade === "DEBITO") return maquina.taxaDebito;
  return parcelas > 1 ? maquina.taxaCreditoParcelado : maquina.taxaCredito;
}

/**
 * Estimativa do recebimento. `hoje` é injetável para teste; na aplicação é a data do recebimento.
 * Valores negativos ou zerados devolvem estimativa zerada em vez de inventar número.
 */
export function estimarRecebimentoCartao(
  valor: number,
  maquina: TaxasMaquina,
  modalidade: ModalidadeCartao,
  parcelas = 1,
  hoje = new Date()
): EstimativaCartao {
  const bruto = valor > 0 ? valor : 0;
  const taxaPercent = taxaAplicavel(maquina, modalidade, parcelas);
  const taxaValor = round2((bruto * taxaPercent) / 100);
  const prazoDias = modalidade === "DEBITO" ? maquina.prazoDebitoDias : maquina.prazoCreditoDias;
  const previsao = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + prazoDias);
  return { taxaPercent, taxaValor, liquido: round2(bruto - taxaValor), prazoDias, previsao };
}

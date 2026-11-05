/**
 * Custo médio ponderado do estoque.
 *
 * Fica isolado porque é a conta que erra em silêncio: ninguém percebe um custo médio errado até
 * o relatório de margem vir estranho, meses depois. Usada pela reclassificação de finalidade,
 * que tira ou devolve ao estoque um item já lançado.
 */

export type AjusteCustoMedio = {
  /** Saldo antes do ajuste, na unidade de venda. */
  saldoAnterior: number;
  /** Custo médio antes do ajuste. */
  custoMedioAnterior: number;
  /** Quantidade que entra ou sai (sempre positiva). */
  quantidade: number;
  /** Custo unitário do item que entra/sai. */
  custoUnitario: number;
  /** true = saída (remoção), false = entrada. */
  remover: boolean;
};

/**
 * Novo custo médio depois de incluir ou remover uma quantidade.
 *
 * Na ENTRADA é a média ponderada clássica. Na SAÍDA, retira do bolo o valor daquele item —
 * se o saldo zera, o custo médio anterior é mantido (não existe média de nada, e zerar o custo
 * faria o próximo relatório mostrar margem infinita).
 */
export function custoMedioApos({
  saldoAnterior,
  custoMedioAnterior,
  quantidade,
  custoUnitario,
  remover
}: AjusteCustoMedio): number {
  const saldoPosterior = remover ? saldoAnterior - quantidade : saldoAnterior + quantidade;
  if (saldoPosterior <= 0) return custoMedioAnterior;

  const valorAnterior = saldoAnterior * custoMedioAnterior;
  const valorMovimento = quantidade * custoUnitario;
  const valorPosterior = remover ? valorAnterior - valorMovimento : valorAnterior + valorMovimento;

  // Saldo positivo com valor negativo significa dado inconsistente (custo informado acima do
  // acumulado). Preservar o custo anterior é menos danoso do que gravar custo negativo.
  if (valorPosterior < 0) return custoMedioAnterior;

  return valorPosterior / saldoPosterior;
}

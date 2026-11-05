/**
 * Ciclo da fatura do cartão: dada a data da compra, em qual fatura ela cai.
 *
 * É puro de propósito — é a parte que erra calado. As armadilhas:
 *  - fechamento no dia 31 em mês de 30 (ou fevereiro): cai no último dia do mês;
 *  - compra DEPOIS do fechamento entra na fatura seguinte;
 *  - vencimento menor que o fechamento significa mês seguinte (fecha 28, vence 5);
 *  - parcelamento: cada parcela anda um ciclo para frente.
 */

export type CicloFatura = {
  /** "AAAA-MM" do vencimento — é como a fatura é chamada no dia a dia. */
  competencia: string;
  fechamento: Date;
  vencimento: Date;
};

/** Último dia do mês (ano/mês com mês base 0). */
function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(ano, mes + 1, 0).getDate();
}

/** Monta a data no dia pedido, limitando ao último dia daquele mês. */
function diaDoMes(ano: number, mes: number, dia: number): Date {
  return new Date(ano, mes, Math.min(dia, ultimoDiaDoMes(ano, mes)));
}

const soData = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Ciclo em que a compra entra.
 *
 * `avancarMeses` empurra para frente, usado nas parcelas: a 1ª vai no ciclo da compra,
 * a 2ª no seguinte, e assim por diante.
 */
export function cicloDaCompra(
  dataCompra: Date,
  diaFechamento: number,
  diaVencimento: number,
  avancarMeses = 0
): CicloFatura {
  const compra = soData(dataCompra);
  let ano = compra.getFullYear();
  let mes = compra.getMonth();

  // Comprou no dia do fechamento ou depois? Já é a fatura do mês seguinte.
  const fechamentoDoMes = diaDoMes(ano, mes, diaFechamento);
  if (compra >= fechamentoDoMes) mes += 1;

  mes += avancarMeses;

  const fechamento = diaDoMes(ano, mes, diaFechamento);
  // Vencimento igual ou anterior ao fechamento quer dizer "no mês seguinte" (fecha 28, vence 5).
  const mesVencimento = diaVencimento > diaFechamento ? mes : mes + 1;
  const vencimento = diaDoMes(ano, mesVencimento, diaVencimento);

  const competencia = `${vencimento.getFullYear()}-${String(vencimento.getMonth() + 1).padStart(2, "0")}`;
  return { competencia, fechamento, vencimento };
}

/** Divide o valor em parcelas que somam exatamente o total (a sobra de centavos vai na primeira). */
export function dividirParcelas(total: number, parcelas: number): number[] {
  const n = Math.max(1, Math.floor(parcelas));
  const centavos = Math.round(total * 100);
  const base = Math.floor(centavos / n);
  const sobra = centavos - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i === 0 ? sobra : 0)) / 100);
}

/**
 * Cálculo das faixas de data dos atalhos de período (financeiro, extrato, relatórios).
 *
 * Fica fora do componente de propósito: é regra de negócio testável, e a virada de mês é onde
 * esse tipo de código costuma errar (31/30/29 de fevereiro, e o fuso).
 *
 * Tudo é calculado no fuso LOCAL. `toISOString()` converteria para UTC e, à noite no Brasil,
 * devolveria o dia anterior — o mês inteiro sairia deslocado.
 */

export type Faixa = { de: string; ate: string };

/** Data local em AAAA-MM-DD, que é o formato do <input type="date">. */
export function iso(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/**
 * Primeiro e último dia do mês deslocado em `offset` meses.
 * `hoje` é injetável para teste; na aplicação é sempre a data corrente.
 */
export function mesRelativo(offset: number, hoje = new Date()): Faixa {
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() + offset, 1);
  // Dia 0 do mês seguinte = último dia do mês pedido: resolve 28/29/30/31 sem tabela.
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + offset + 1, 0);
  return { de: iso(inicio), ate: iso(fim) };
}

/** Intervalo dos últimos `dias` terminando hoje (hoje incluso). */
export function ultimosDias(dias: number, hoje = new Date()): Faixa {
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - (dias - 1));
  return { de: iso(inicio), ate: iso(hoje) };
}

/** Ano civil corrente. */
export function anoCorrente(hoje = new Date()): Faixa {
  const ano = hoje.getFullYear();
  return { de: `${ano}-01-01`, ate: `${ano}-12-31` };
}

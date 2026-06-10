/**
 * Condição de pagamento → parcelas de contas a receber.
 *
 * A condição é um texto livre informado na venda/orçamento, interpretado como dias de
 * vencimento separados por barra: "30" (1 parcela em 30 dias), "30/60/90" (3 parcelas),
 * "0/30" (entrada + 30 dias). "À vista" vence hoje. Sem condição informada, vale o
 * fallback (padrão: 1 parcela em 30 dias, comportamento histórico do sistema).
 */

export type ParcelaGerada = {
  numero: number;
  totalParcelas: number;
  vencimento: Date;
  valor: number;
};

const MAX_PARCELAS = 60;
const MAX_DIAS = 3650;

/** Interpreta a condição como lista ordenada de dias de vencimento (sem duplicatas). */
export function parseCondicaoDias(
  condicao: string | null | undefined,
  fallbackDias: number[] = [30]
): number[] {
  const texto = (condicao ?? "").trim().toLowerCase();
  if (!texto) return fallbackDias;

  const numeros = texto.match(/\d+/g);

  // "À vista" (e variações) sem dias informados vence hoje. Obs.: \b não funciona antes
  // de acento em JS, por isso o teste é por inclusão.
  if ((!numeros || numeros.length === 0) && texto.includes("vista")) return [0];
  if (!numeros || numeros.length === 0) return fallbackDias;

  const dias = Array.from(
    new Set(numeros.map((n) => Math.min(parseInt(n, 10), MAX_DIAS)))
  ).sort((a, b) => a - b);

  return dias.slice(0, MAX_PARCELAS);
}

/**
 * Gera as parcelas para um total: divide em partes iguais (centavos) e a última parcela
 * absorve a diferença de arredondamento, garantindo que a soma feche exatamente no total.
 */
export function gerarParcelas(
  total: number,
  condicao: string | null | undefined,
  options?: { base?: Date; fallbackDias?: number[] }
): ParcelaGerada[] {
  const dias = parseCondicaoDias(condicao, options?.fallbackDias ?? [30]);
  const base = options?.base ?? new Date();

  const totalCentavos = Math.round(total * 100);
  const n = dias.length;
  const porParcela = Math.floor(totalCentavos / n);
  const resto = totalCentavos - porParcela * n;

  return dias.map((diasVencimento, index) => {
    const vencimento = new Date(base);
    vencimento.setDate(vencimento.getDate() + diasVencimento);
    const centavos = index === n - 1 ? porParcela + resto : porParcela;
    return {
      numero: index + 1,
      totalParcelas: n,
      vencimento,
      valor: centavos / 100
    };
  });
}

/** Rótulo curto da parcela para descrições: "(1/3)" — omitido quando é parcela única. */
export function rotuloParcela(parcela: ParcelaGerada): string {
  return parcela.totalParcelas > 1 ? ` (${parcela.numero}/${parcela.totalParcelas})` : "";
}

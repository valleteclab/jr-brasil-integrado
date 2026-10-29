/**
 * Valor monetário por extenso (pt-BR) — exigência de recibo: "a importância de R$ 1.250,00
 * (mil, duzentos e cinquenta reais)".
 *
 * Regras que costumam sair erradas e estão cobertas:
 *  - "cem" x "cento e" (100 x 101);
 *  - "mil" sem "um" na frente (1.000, não "um mil");
 *  - "e" entre centena e dezena, e entre o milhar e um resto menor que 100 ou centena redonda
 *    (1.015 = "mil e quinze"; 1.200 = "mil e duzentos"; 1.250 = "mil, duzentos e cinquenta");
 *  - singular/plural de real/reais, centavo/centavos, milhão/milhões.
 */

const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
const DEZ_A_DEZENOVE = [
  "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"
];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"
];

/** 1 a 999 por extenso. */
function ateNovecentosENoventaENove(n: number): string {
  if (n <= 0) return "";
  if (n === 100) return "cem";

  const centena = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];

  if (centena > 0) partes.push(CENTENAS[centena]);

  if (resto > 0) {
    let texto: string;
    if (resto < 10) texto = UNIDADES[resto];
    else if (resto < 20) texto = DEZ_A_DEZENOVE[resto - 10];
    else {
      const dezena = Math.floor(resto / 10);
      const unidade = resto % 10;
      texto = unidade > 0 ? `${DEZENAS[dezena]} e ${UNIDADES[unidade]}` : DEZENAS[dezena];
    }
    partes.push(texto);
  }

  return partes.join(" e ");
}

const ESCALAS: Array<{ divisor: number; singular: string; plural: string }> = [
  { divisor: 1_000_000_000, singular: "bilhão", plural: "bilhões" },
  { divisor: 1_000_000, singular: "milhão", plural: "milhões" },
  { divisor: 1_000, singular: "mil", plural: "mil" }
];

/** Número inteiro por extenso (0 a 999 bilhões). */
export function numeroPorExtenso(valor: number): string {
  const n = Math.trunc(Math.abs(valor));
  if (n === 0) return "zero";

  const partes: string[] = [];
  let resto = n;

  for (const escala of ESCALAS) {
    const quantidade = Math.floor(resto / escala.divisor);
    if (quantidade > 0) {
      const nome = quantidade === 1 ? escala.singular : escala.plural;
      // "mil" não leva "um" na frente; milhão/bilhão levam.
      partes.push(escala.divisor === 1_000 && quantidade === 1 ? nome : `${numeroPorExtenso(quantidade)} ${nome}`);
      resto %= escala.divisor;
    }
  }

  if (resto > 0) partes.push(ateNovecentosENoventaENove(resto));
  if (partes.length === 1) return partes[0];

  // O último grupo entra com "e" quando é menor que 100, centena redonda, ou quando o número
  // termina numa escala exata ("dois milhões e quinhentos mil"); senão, vírgula.
  const ultimo = partes[partes.length - 1];
  const anteriores = partes.slice(0, -1).join(", ");
  const ligaComE = resto === 0 || resto < 100 || resto % 100 === 0;
  return ligaComE ? `${anteriores} e ${ultimo}` : `${anteriores}, ${ultimo}`;
}

/** Valor em reais por extenso: "mil, duzentos e cinquenta reais e trinta centavos". */
export function valorPorExtenso(valor: number): string {
  const centavosTotais = Math.round(Math.abs(valor) * 100);
  const reais = Math.floor(centavosTotais / 100);
  const centavos = centavosTotais % 100;

  const parteReais = reais > 0 ? `${numeroPorExtenso(reais)} ${reais === 1 ? "real" : "reais"}` : "";
  const parteCentavos = centavos > 0 ? `${numeroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}` : "";

  if (parteReais && parteCentavos) return `${parteReais} e ${parteCentavos}`;
  return parteReais || parteCentavos || "zero real";
}

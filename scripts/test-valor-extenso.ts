/**
 * Teste do valor por extenso usado no recibo — SEM REDE, SEM BANCO.
 * Uso: npx tsx scripts/test-valor-extenso.ts
 */
import assert from "node:assert/strict";
import { numeroPorExtenso, valorPorExtenso } from "../src/lib/texto/valor-extenso";

const casos: Array<[number, string]> = [
  [0, "zero real"],
  [1, "um real"],
  [2, "dois reais"],
  [0.01, "um centavo"],
  [0.5, "cinquenta centavos"],
  [1.5, "um real e cinquenta centavos"],
  [15, "quinze reais"],
  [19.99, "dezenove reais e noventa e nove centavos"],
  [60, "sessenta reais"],
  [100, "cem reais"],
  [101, "cento e um reais"],
  [199, "cento e noventa e nove reais"],
  [1000, "mil reais"],
  [1015, "mil e quinze reais"],
  [1200, "mil e duzentos reais"],
  [1250, "mil, duzentos e cinquenta reais"],
  [2000, "dois mil reais"],
  [46011.32, "quarenta e seis mil e onze reais e trinta e dois centavos"],
  [296887.13, "duzentos e noventa e seis mil, oitocentos e oitenta e sete reais e treze centavos"],
  [1000000, "um milhão de reais".replace(" de", "")],
  [2500000, "dois milhões e quinhentos mil reais"]
];

for (const [valor, esperado] of casos) {
  const obtido = valorPorExtenso(valor);
  assert.equal(obtido, esperado, `${valor} -> "${obtido}" (esperado "${esperado}")`);
}

assert.equal(numeroPorExtenso(100), "cem");
assert.equal(numeroPorExtenso(1000), "mil");
assert.equal(numeroPorExtenso(21), "vinte e um");
assert.equal(numeroPorExtenso(0), "zero");

console.log(`Valor por extenso: ${casos.length} casos (cem x cento e, mil sem "um", vírgula x "e", singular/plural). OK`);

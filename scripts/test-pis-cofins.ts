/**
 * Teste da apuração mensal de PIS/COFINS — SEM REDE, SEM BANCO.
 * Exercita as alíquotas de lei, o vencimento (dia 25 antecipado para dia útil) e a lógica de
 * exclusão da base (monofásico, alíquota zero, ST, isenção, suspensão).
 *
 * Uso: npx tsx scripts/test-pis-cofins.ts
 */
import assert from "node:assert/strict";
import { ALIQUOTAS, DARF_PIS_COFINS, vencimentoPisCofins } from "../src/domains/fiscal/presumido/pis-cofins-use-cases";
import { grupoMonofasicoDoNcm } from "../src/domains/fiscal/simples/monofasico-ncm";

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// 1) Alíquotas e DARFs de cada regime.
assert.equal(ALIQUOTAS.CUMULATIVO.pis, 0.0065);
assert.equal(ALIQUOTAS.CUMULATIVO.cofins, 0.03);
assert.equal(ALIQUOTAS.NAO_CUMULATIVO.pis, 0.0165);
assert.equal(ALIQUOTAS.NAO_CUMULATIVO.cofins, 0.076);
assert.equal(DARF_PIS_COFINS.CUMULATIVO.pis, "8109");
assert.equal(DARF_PIS_COFINS.CUMULATIVO.cofins, "2172");
assert.equal(DARF_PIS_COFINS.NAO_CUMULATIVO.pis, "6912");
assert.equal(DARF_PIS_COFINS.NAO_CUMULATIVO.cofins, "5856");

// 2) Vencimento: dia 25 do mês seguinte, antecipando quando cai em fim de semana.
assert.equal(vencimentoPisCofins(2026, 9).toISOString().slice(0, 10), "2026-10-23"); // 25/10/2026 = domingo
assert.equal(vencimentoPisCofins(2026, 10).toISOString().slice(0, 10), "2026-11-25"); // quarta-feira

// 3) Serviços da VALLETECLAB em setembro/2026 (cumulativo, sem exclusão e sem retenção de
//    PIS/COFINS pelo município). Valores conferidos com as notas autorizadas do mês.
const setembro = [20000.0, 36598.5, 4500.0, 246941.88, 119.9];
const baseSetembro = round2(setembro.reduce((s, v) => s + v, 0));
const pis = round2(baseSetembro * ALIQUOTAS.CUMULATIVO.pis);
const cofins = round2(baseSetembro * ALIQUOTAS.CUMULATIVO.cofins);
console.log(`  base ${brl(baseSetembro)} | PIS ${brl(pis)} | COFINS ${brl(cofins)}`);
assert.equal(baseSetembro, 308160.28);
assert.equal(pis, 2003.04);
assert.equal(cofins, 9244.81);

// 4) Revenda de produto monofásico sai da base (a indústria já recolheu por toda a cadeia).
//    Exemplo: autopeça (NCM 8708) — grupo monofásico da Lei 10.485/2002.
assert.ok(grupoMonofasicoDoNcm("87081000"), "autopeça deveria ser detectada como monofásica");
assert.equal(grupoMonofasicoDoNcm("94036000"), null, "móvel de madeira não é monofásico");

const vendas = [
  { descricao: "Autopeça (monofásico)", valor: 1000, ncm: "87081000", cst: "01" },
  { descricao: "Serviço de instalação", valor: 500, ncm: null, cst: "01" },
  { descricao: "Item com alíquota zero", valor: 300, ncm: "94036000", cst: "06" }
];
const CST_FORA = ["04", "05", "06", "07", "08", "09"];
let tributavel = 0;
let excluido = 0;
for (const v of vendas) {
  const fora = CST_FORA.includes(v.cst) || Boolean(grupoMonofasicoDoNcm(v.ncm));
  if (fora) excluido += v.valor;
  else tributavel += v.valor;
}
assert.equal(tributavel, 500, "só o serviço deveria compor a base");
assert.equal(excluido, 1300, "monofásico e alíquota zero saem da base");
console.log(`  exclusões: ${brl(excluido)} fora da base, ${brl(tributavel)} tributáveis`);

console.log("PIS/COFINS: alíquotas, vencimento e exclusões da base conferem. OK");

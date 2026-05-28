/**
 * Testes do motor de cálculo fiscal.
 * Execute com:  npx tsx src/domains/fiscal/calculation/tax-calculator.test.ts
 */

import { calcularImpostos, somarTotaisNfe } from "./tax-calculator";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function eq(a: number, b: number, label: string) {
  assert(
    Math.abs(a - b) < 0.01,
    label,
    `esperado ${b}, obtido ${a}`
  );
}

// ─── GRUPO 1: Simples Nacional sem débito (CSOSN 400) ─────────────────────

console.log("\n[1] Simples Nacional · CSOSN 400 · venda interna BA · R$ 500,00");
{
  const r = calcularImpostos({
    regime: "SIMPLES_NACIONAL",
    ufOrigem: "BA",
    ufDestino: "BA",
    tipoDestinatario: "CONTRIBUINTE_ICMS",
    valorBruto: 500,
    icmsCSOSN: "400",
    pisCST: "07",
    pisAliquota: 0,
    cofinsCST: "07",
    cofinsAliquota: 0
  });

  assert(r.icms.semDestaque, "ICMS sem destaque no Simples");
  eq(r.icms.valor, 0, "ICMS valor = 0");
  assert(r.icmsST === null, "Sem ICMS-ST");
  eq(r.pis.valor, 0, "PIS = 0 (CST 07)");
  eq(r.cofins.valor, 0, "COFINS = 0 (CST 07)");
  eq(r.totalTributos, 0, "Total tributos = 0");
}

// ─── GRUPO 2: Lucro Presumido · CST 00 · ICMS + PIS + COFINS ──────────────

console.log("\n[2] Lucro Presumido · CST 00 · ICMS 12% · PIS 0,65% · COFINS 3% · R$ 1.000,00");
{
  const r = calcularImpostos({
    regime: "REGIME_NORMAL",
    ufOrigem: "BA",
    ufDestino: "BA",
    tipoDestinatario: "CONTRIBUINTE_ICMS",
    valorBruto: 1000,
    icmsCST: "00",
    icmsAliquota: 12,
    pisCST: "01",
    pisAliquota: 0.65,
    cofinsCST: "01",
    cofinsAliquota: 3
  });

  eq(r.icms.baseCalculo, 1000, "BC ICMS = 1.000");
  eq(r.icms.valor, 120, "ICMS = 120 (12%)");
  eq(r.pis.valor, 6.5, "PIS = 6,50 (0,65%)");
  eq(r.cofins.valor, 30, "COFINS = 30 (3%)");
  eq(r.totalTributos, 156.5, "Total tributos = 156,50");
}

// ─── GRUPO 3: Redução de base de cálculo ICMS (CST 20) ─────────────────────

console.log("\n[3] Lucro Presumido · CST 20 · Redução BC 33,33% · ICMS 12% · R$ 900,00");
{
  const r = calcularImpostos({
    regime: "REGIME_NORMAL",
    ufOrigem: "BA",
    ufDestino: "BA",
    tipoDestinatario: "CONTRIBUINTE_ICMS",
    valorBruto: 900,
    icmsCST: "20",
    icmsAliquota: 12,
    icmsReducaoBC: 33.33,
    pisCST: "01",
    pisAliquota: 0.65,
    cofinsCST: "01",
    cofinsAliquota: 3
  });

  const bcEsperado = 900 * (1 - 0.3333);
  eq(r.icms.baseCalculo, Math.round(bcEsperado * 100) / 100, "BC ICMS com redução 33,33%");
  eq(r.icms.valor, Math.round(bcEsperado * 0.12 * 100) / 100, "ICMS sobre BC reduzida");
  assert(!r.icms.semDestaque, "Tem destaque ICMS");
}

// ─── GRUPO 4: ICMS-ST com MVA (CST 10) ────────────────────────────────────

console.log("\n[4] Lucro Presumido · CST 10 · ICMS 12% · MVA 30% · ST 12% · R$ 1.000,00");
{
  const r = calcularImpostos({
    regime: "REGIME_NORMAL",
    ufOrigem: "BA",
    ufDestino: "BA",
    tipoDestinatario: "CONTRIBUINTE_ICMS",
    valorBruto: 1000,
    icmsCST: "10",
    icmsAliquota: 12,
    icmsSTMVA: 30,
    icmsSTAliquota: 12,
    pisCST: "01",
    pisAliquota: 0.65,
    cofinsCST: "01",
    cofinsAliquota: 3
  });

  // BC ST = (1000 + 120) × 1.30 = 1456,00
  // ICMS ST a recolher = 1456 × 0.12 - 120 = 174,72 - 120 = 54,72
  eq(r.icms.baseCalculo, 1000, "BC ICMS = 1.000");
  eq(r.icms.valor, 120, "ICMS normal = 120");
  assert(r.icmsST !== null, "ICMS-ST calculado");
  eq(r.icmsST!.baseCalculo, 1456, "BC ST = 1.456");
  eq(r.icmsST!.valor, 54.72, "ICMS-ST a recolher = 54,72");
}

// ─── GRUPO 5: Simples Nacional com ST (CSOSN 201) ─────────────────────────

console.log("\n[5] Simples Nacional · CSOSN 201 · MVA 40% · ST 12% · R$ 800,00");
{
  const r = calcularImpostos({
    regime: "SIMPLES_NACIONAL",
    ufOrigem: "BA",
    ufDestino: "BA",
    tipoDestinatario: "CONTRIBUINTE_ICMS",
    valorBruto: 800,
    icmsCSOSN: "201",
    icmsSTMVA: 40,
    icmsSTAliquota: 12,
    pisCST: "07",
    pisAliquota: 0,
    cofinsCST: "07",
    cofinsAliquota: 0
  });

  // Para Simples com ST: BC ST = vProd × (1 + MVA/100) = 800 × 1.40 = 1.120
  // ICMS ST = 1120 × 0.12 = 134,40
  assert(r.icms.semDestaque, "ICMS sem destaque (Simples)");
  eq(r.icms.valor, 0, "ICMS valor = 0");
  assert(r.icmsST !== null, "ICMS-ST calculado para Simples");
  eq(r.icmsST!.baseCalculo, 1120, "BC ST = 1.120");
  eq(r.icmsST!.valor, 134.4, "ICMS-ST = 134,40");
}

// ─── GRUPO 6: FCP ─────────────────────────────────────────────────────────

console.log("\n[6] Lucro Presumido · CST 00 · ICMS 12% · FCP 2% · R$ 500,00");
{
  const r = calcularImpostos({
    regime: "REGIME_NORMAL",
    ufOrigem: "BA",
    ufDestino: "BA",
    tipoDestinatario: "CONTRIBUINTE_ICMS",
    valorBruto: 500,
    icmsCST: "00",
    icmsAliquota: 12,
    fcpAliquota: 2,
    pisCST: "01",
    pisAliquota: 0.65,
    cofinsCST: "01",
    cofinsAliquota: 3
  });

  assert(r.fcp !== null, "FCP calculado");
  eq(r.fcp!.valor, 10, "FCP = 10 (2% sobre 500)");
  eq(r.totalTributos, 60 + 10 + 3.25 + 15, "Total tributos com FCP");
}

// ─── GRUPO 7: IPI tributado ────────────────────────────────────────────────

console.log("\n[7] Lucro Presumido · CST ICMS 00 · IPI CST 50 · 5% · R$ 1.000,00");
{
  const r = calcularImpostos({
    regime: "REGIME_NORMAL",
    ufOrigem: "SP",
    ufDestino: "SP",
    tipoDestinatario: "CONTRIBUINTE_ICMS",
    valorBruto: 1000,
    icmsCST: "00",
    icmsAliquota: 12,
    ipiCST: "50",
    ipiAliquota: 5,
    pisCST: "01",
    pisAliquota: 0.65,
    cofinsCST: "01",
    cofinsAliquota: 3
  });

  assert(r.ipi !== null, "IPI calculado");
  eq(r.ipi!.valor, 50, "IPI = 50 (5% sobre 1.000)");
  eq(r.totalTributos, 120 + 50 + 6.5 + 30, "Total tributos com IPI");
}

// ─── GRUPO 8: CST 40 — isento ─────────────────────────────────────────────

console.log("\n[8] Lucro Presumido · CST 40 (isento) · PIS/COFINS 0 · R$ 200,00");
{
  const r = calcularImpostos({
    regime: "REGIME_NORMAL",
    ufOrigem: "BA",
    ufDestino: "BA",
    tipoDestinatario: "CONSUMIDOR_FINAL",
    valorBruto: 200,
    icmsCST: "40",
    pisCST: "07",
    pisAliquota: 0,
    cofinsCST: "07",
    cofinsAliquota: 0
  });

  eq(r.icms.valor, 0, "ICMS = 0 (isento)");
  assert(r.icms.semDestaque, "Sem destaque ICMS CST 40");
  eq(r.totalTributos, 0, "Total tributos = 0");
}

// ─── GRUPO 9: Desconto ────────────────────────────────────────────────────

console.log("\n[9] Lucro Presumido · CST 00 · 12% · vProd 1.000 · Desconto 100");
{
  const r = calcularImpostos({
    regime: "REGIME_NORMAL",
    ufOrigem: "BA",
    ufDestino: "BA",
    tipoDestinatario: "CONTRIBUINTE_ICMS",
    valorBruto: 1000,
    desconto: 100,
    icmsCST: "00",
    icmsAliquota: 12,
    pisCST: "01",
    pisAliquota: 0.65,
    cofinsCST: "01",
    cofinsAliquota: 3
  });

  eq(r.icms.baseCalculo, 900, "BC ICMS = 900 (1000 - 100)");
  eq(r.icms.valor, 108, "ICMS = 108");
  eq(r.pis.valor, 5.85, "PIS = 5,85");
  eq(r.cofins.valor, 27, "COFINS = 27");
}

// ─── GRUPO 10: somarTotaisNfe ─────────────────────────────────────────────

console.log("\n[10] somarTotaisNfe · 2 itens simples");
{
  const item1 = calcularImpostos({
    regime: "REGIME_NORMAL", ufOrigem: "BA", ufDestino: "BA",
    tipoDestinatario: "CONTRIBUINTE_ICMS",
    valorBruto: 500,
    icmsCST: "00", icmsAliquota: 12,
    pisCST: "01", pisAliquota: 0.65,
    cofinsCST: "01", cofinsAliquota: 3
  });

  const item2 = calcularImpostos({
    regime: "REGIME_NORMAL", ufOrigem: "BA", ufDestino: "BA",
    tipoDestinatario: "CONTRIBUINTE_ICMS",
    valorBruto: 300,
    icmsCST: "00", icmsAliquota: 12,
    pisCST: "01", pisAliquota: 0.65,
    cofinsCST: "01", cofinsAliquota: 3
  });

  const totais = somarTotaisNfe([
    { valorBruto: 500, desconto: 0, frete: 0, calculo: item1 },
    { valorBruto: 300, desconto: 0, frete: 0, calculo: item2 }
  ]);

  eq(totais.vProd, 800, "vProd = 800");
  eq(totais.vICMS, 96, "vICMS = 96 (12% de 800)");
  eq(totais.vPIS, 5.2, "vPIS = 5,20");
  eq(totais.vCOFINS, 24, "vCOFINS = 24");
  eq(totais.vNF, 800, "vNF = 800 (sem frete/IPI/ST)");
}

// ─── Resultado final ──────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Resultado: ${passed} passou · ${failed} falhou`);
console.log("─".repeat(50));

if (failed > 0) {
  process.exit(1);
}

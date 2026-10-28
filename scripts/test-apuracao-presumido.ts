/**
 * Teste da classificação de receita do Lucro Presumido — SEM REDE, SEM BANCO.
 *
 * Reproduz o caso real que originou o módulo: 3º trimestre/2026 da VALLETECLAB, em que a obra do
 * contrato 006/2026 (empreitada total) tinha sido apurada com material a 8% e serviço a 32%,
 * gerando R$ 25.148,68 de IRPJ+CSLL pagos a maior.
 *
 * Uso: npx tsx scripts/test-apuracao-presumido.ts
 */
import assert from "node:assert/strict";
import { classificarReceita, receitaDaNota } from "../src/domains/fiscal/presumido/classificacao-receita";
import {
  CSLL_ALIQUOTA,
  IRPJ_ADICIONAL_ALIQUOTA,
  IRPJ_ADICIONAL_LIMITE_MENSAL,
  IRPJ_ALIQUOTA,
  PRESUNCOES,
  vencimentoDoTrimestre
} from "../src/domains/fiscal/presumido/tabelas-presuncao";

const nota = (extra: Partial<Parameters<typeof classificarReceita>[0]> = {}) => ({
  modelo: "NFSE" as never,
  itemListaServico: "01.05.01",
  modalidadeObra: null,
  valorServicos: 20000,
  valorProdutos: 0,
  valorIrRetido: 960, // 4,8% — serviço em geral
  ...extra
});

// 1) Serviço em geral: 32% / 32%.
const servico = classificarReceita(nota());
assert.equal(servico.tipo, "SERVICO_GERAL");
assert.equal(PRESUNCOES[servico.tipo].irpj, 0.32);
assert.deepEqual(servico.avisos, [], "serviço com retenção de 4,8% não deve gerar aviso");

// 2) Obra (LC 116 07.02) COM contrato de empreitada total: 8% / 12% sobre a receita bruta inteira.
const obra = classificarReceita(nota({ itemListaServico: "07.02.02", modalidadeObra: "TOTAL", valorServicos: 168528.34, valorIrRetido: 2022.34 }));
assert.equal(obra.tipo, "OBRA_EMPREITADA_TOTAL");
assert.equal(PRESUNCOES[obra.tipo].irpj, 0.08);
assert.equal(PRESUNCOES[obra.tipo].csll, 0.12);
assert.deepEqual(obra.avisos, [], "obra com contrato total e IRRF de 1,2% não deve gerar aviso");

// 3) Obra SEM contrato vinculado: não inventa 8% — classifica como serviço e avisa.
const obraSemContrato = classificarReceita(nota({ itemListaServico: "07.02.02", valorServicos: 168528.34, valorIrRetido: 2022.34 }));
assert.equal(obraSemContrato.tipo, "SERVICO_GERAL");
assert.ok(obraSemContrato.avisos.some((a) => a.includes("empreitada TOTAL")), "deve orientar a vincular o contrato");

// 4) Empreitada PARCIAL continua em 32% (é o que a IN RFB 1.700/17 art. 33 determina).
const parcial = classificarReceita(nota({ itemListaServico: "07.02.02", modalidadeObra: "PARCIAL", valorServicos: 100000, valorIrRetido: 1200 }));
assert.equal(parcial.tipo, "SERVICO_GERAL");
assert.ok(parcial.avisos.some((a) => a.includes("parcial")), "deve explicar por que não é 8%");

// 5) Conferência cruzada com a retenção: serviço classificado a 32% mas retido a 1,2% levanta aviso.
const divergente = classificarReceita(nota({ valorServicos: 59000, valorIrRetido: 708 })); // 1,2%
assert.equal(divergente.tipo, "SERVICO_GERAL");
assert.ok(divergente.avisos.some((a) => a.includes("1,20%")), "deve apontar a divergência de retenção");

// 6) Nota de produto é mercadoria (8% / 12%), mesmo sem item de serviço.
const mercadoria = classificarReceita(nota({ modelo: "NFE" as never, itemListaServico: null, valorServicos: 0, valorProdutos: 5058, valorIrRetido: 60.7 }));
assert.equal(mercadoria.tipo, "MERCADORIA");
assert.equal(receitaDaNota({ valorServicos: 0, valorProdutos: 5058 }), 5058);

// 7) O caso real completo: 3º trimestre/2026 da VALLETECLAB (regime de caixa).
type Linha = { valor: number; irrf: number; lc116: string; obra?: "TOTAL"; modelo?: "NFE" };
const TRIMESTRE: Linha[] = [
  { valor: 75360.0, irrf: 904.32, lc116: "", modelo: "NFE" },
  { valor: 29409.97, irrf: 352.92, lc116: "", modelo: "NFE" },
  { valor: 1597.0, irrf: 19.16, lc116: "", modelo: "NFE" },
  { valor: 62800.0, irrf: 753.6, lc116: "", modelo: "NFE" },
  { valor: 59000.0, irrf: 708.0, lc116: "07.02.02", obra: "TOTAL" },
  { valor: 20000.0, irrf: 960.0, lc116: "01.05.01" },
  { valor: 20000.0, irrf: 960.0, lc116: "01.05.01" },
  { valor: 4500.0, irrf: 216.0, lc116: "01.05.01" },
  { valor: 36598.5, irrf: 1756.73, lc116: "99.01.01" },
  { valor: 119.9, irrf: 0, lc116: "01.05.01" },
  { valor: 168528.34, irrf: 2022.34, lc116: "07.02.02", obra: "TOTAL" },
  { valor: 5058.0, irrf: 60.7, lc116: "", modelo: "NFE" },
  { valor: 4500.0, irrf: 216.0, lc116: "01.05.01" },
  { valor: 36598.5, irrf: 1756.73, lc116: "99.01.01" },
  { valor: 119.9, irrf: 0, lc116: "01.05.01" },
  { valor: 20000.0, irrf: 960.0, lc116: "01.05.01" },
  { valor: 36598.5, irrf: 1756.73, lc116: "99.01.01" },
  { valor: 246941.88, irrf: 2963.31, lc116: "07.02.02", obra: "TOTAL" },
  { valor: 119.9, irrf: 0, lc116: "01.05.01" }
];

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
let baseIrpj = 0;
let baseCsll = 0;
let irrfTotal = 0;
let receita = 0;
for (const l of TRIMESTRE) {
  const c = classificarReceita({
    modelo: (l.modelo ?? "NFSE") as never,
    itemListaServico: l.lc116 || null,
    modalidadeObra: l.obra ?? null,
    valorServicos: l.modelo === "NFE" ? 0 : l.valor,
    valorProdutos: l.modelo === "NFE" ? l.valor : 0,
    valorIrRetido: l.irrf
  });
  const p = PRESUNCOES[c.tipo];
  receita = round2(receita + l.valor);
  baseIrpj = round2(baseIrpj + l.valor * p.irpj);
  baseCsll = round2(baseCsll + l.valor * p.csll);
  irrfTotal = round2(irrfTotal + l.irrf);
}

const limite = IRPJ_ADICIONAL_LIMITE_MENSAL * 3;
const irpj = round2(baseIrpj * IRPJ_ALIQUOTA + Math.max(baseIrpj - limite, 0) * IRPJ_ADICIONAL_ALIQUOTA);
const irpjRecolher = round2(irpj - irrfTotal);
const csll = round2(baseCsll * CSLL_ALIQUOTA);

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
console.log(`  receita ${brl(receita)} | base IRPJ ${brl(baseIrpj)} | base CSLL ${brl(baseCsll)}`);
console.log(`  IRPJ a recolher ${brl(irpjRecolher)} | CSLL devida ${brl(csll)}`);

// Valores conferidos com a planilha enviada à contabilidade (diferença de centavos por arredondamento).
const perto = (a: number, b: number, tol = 0.05) => Math.abs(a - b) <= tol;
assert.ok(perto(receita, 827850.39), `receita ${receita}`);
assert.ok(perto(baseIrpj, 109225.28), `base IRPJ ${baseIrpj}`);
assert.ok(perto(baseCsll, 135173.09), `base CSLL ${baseCsll}`);
assert.ok(perto(irpjRecolher, 4939.78, 0.1), `IRPJ a recolher ${irpjRecolher}`);
assert.ok(perto(csll, 12165.58, 0.1), `CSLL ${csll}`);

// 8) Vencimento: último dia útil do mês seguinte ao trimestre (31/10/2026 é sábado -> 30/10).
assert.equal(vencimentoDoTrimestre(2026, 3).toISOString().slice(0, 10), "2026-10-30");
assert.equal(vencimentoDoTrimestre(2026, 4).toISOString().slice(0, 10), "2027-01-29");

console.log("Lucro Presumido: classificação, presunções e apuração do 3T2026 conferem com a planilha. OK");

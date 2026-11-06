/**
 * Teste do crédito presumido por NCM — SEM REDE, SEM BANCO.
 *
 * Mexe direto no ICMS a recolher, então cobre o que erra na prática: NCM com e sem ponto,
 * anexo que lista a posição em vez do item, saída interestadual (que não entra), item isento,
 * nota cancelada e o estorno das entradas. O último caso reproduz outubro/2026 da Valleteclab.
 */
import {
  apurarCreditoPresumido,
  ncmContemplado,
  normalizarNcm,
  type RegraCreditoPresumido
} from "../src/domains/fiscal/sped/credito-presumido";
import type { SpedDocumento, SpedDocumentoItem, SpedItemCatalogo } from "../src/domains/fiscal/sped/types";

let falhas = 0;
function conferir(titulo: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas += 1;
  console.log(`${ok ? "ok  " : "FALHA"} ${titulo}`);
  if (!ok) console.log(`      esperado ${JSON.stringify(esperado)}\n      obtido   ${JSON.stringify(obtido)}`);
}

// --- normalização e match de NCM -------------------------------------------
conferir("NCM com ponto normaliza para dígitos", normalizarNcm("8471.50.10"), "84715010");
conferir("NCM nulo normaliza para vazio", normalizarNcm(null), "");
conferir("item igual ao anexo é contemplado", ncmContemplado("84715010", ["84715010"]), true);
conferir("anexo com ponto bate com item sem ponto", ncmContemplado("84715010", ["8471.50.10"]), true);
conferir("anexo pela posição alcança o item", ncmContemplado("84715010", ["8471"]), true);
conferir("NCM de fora não é contemplado", ncmContemplado("68071000", ["8471", "8443"]), false);
// O inverso NÃO vale: anexo específico não pode alcançar um NCM mais genérico.
conferir("anexo específico não alcança NCM genérico", ncmContemplado("8471", ["84715010"]), false);
conferir("item sem NCM nunca é contemplado", ncmContemplado(null, ["8471"]), false);

// --- montagem dos cenários --------------------------------------------------
const catalogo: SpedItemCatalogo[] = [
  { codigo: "SRV", descricao: "Servidor", gtin: null, unidade: "UN", tipoItem: "00", ncm: "84715010", cest: null },
  { codigo: "NOTE", descricao: "Notebook", gtin: null, unidade: "UN", tipoItem: "00", ncm: "84713019", cest: null },
  { codigo: "SWT", descricao: "Switch", gtin: null, unidade: "UN", tipoItem: "00", ncm: "85176262", cest: null },
  { codigo: "BRITA", descricao: "Brita 3/4", gtin: null, unidade: "M3", tipoItem: "00", ncm: "25171000", cest: null },
  { codigo: "TONER", descricao: "Toner HP", gtin: null, unidade: "UN", tipoItem: "07", ncm: "84439933", cest: null }
];

function item(codigo: string, cfop: string, valor: number, icms: number): SpedDocumentoItem {
  return {
    numeroItem: 1,
    codigoItem: codigo,
    descricaoComplementar: null,
    quantidade: 1,
    unidade: "UN",
    valorItem: valor,
    valorDesconto: 0,
    movimentaEstoque: true,
    cfop,
    cstIcms: "000",
    baseIcms: valor,
    aliquotaIcms: valor > 0 ? (icms / valor) * 100 : 0,
    valorIcms: icms,
    baseIcmsSt: 0,
    aliquotaIcmsSt: 0,
    valorIcmsSt: 0,
    valorReducaoBc: 0,
    cstIpi: null,
    baseIpi: 0,
    aliquotaIpi: 0,
    valorIpi: 0,
    cstPis: null,
    basePis: 0,
    aliquotaPis: 0,
    valorPis: 0,
    cstCofins: null,
    baseCofins: 0,
    aliquotaCofins: 0,
    valorCofins: 0,
    antecipacaoParcial: 0
  };
}

function doc(tipo: "SAIDA" | "ENTRADA", itens: SpedDocumentoItem[], cancelado = false): SpedDocumento {
  return {
    tipo,
    modelo: "55",
    cancelado,
    codigoParticipante: "P1",
    serie: "1",
    numero: "1",
    chaveAcesso: null,
    dataEmissao: new Date(2026, 9, 15),
    dataEntradaSaida: new Date(2026, 9, 15),
    aPrazo: false,
    valorDocumento: itens.reduce((s, i) => s + i.valorItem, 0),
    valorDesconto: 0,
    valorMercadorias: itens.reduce((s, i) => s + i.valorItem, 0),
    valorFrete: 0,
    valorSeguro: 0,
    outrasDespesas: 0,
    ufDestino: "BA",
    itens,
    rotulo: "NF-e 1"
  };
}

const regra: RegraCreditoPresumido = { percentual: 61.11, ncms: ["84715010", "84713019", "85176262"], cfops: [] };

// --- o benefício só alcança a saída interna tributada do produto do anexo ---
conferir(
  "saída interna de produto do anexo gera crédito presumido",
  apurarCreditoPresumido([doc("SAIDA", [item("SRV", "5102", 1000, 205)])], catalogo, regra).creditoPresumido,
  125.28 // 205 × 61,11%
);
conferir(
  "saída INTERESTADUAL não gera crédito (benefício é só interno)",
  apurarCreditoPresumido([doc("SAIDA", [item("SRV", "6102", 1000, 120)])], catalogo, regra).creditoPresumido,
  0
);
conferir(
  "produto fora do anexo não gera crédito",
  apurarCreditoPresumido([doc("SAIDA", [item("BRITA", "5102", 1000, 205)])], catalogo, regra).creditoPresumido,
  0
);
conferir(
  "saída sem ICMS debitado não gera crédito",
  apurarCreditoPresumido([doc("SAIDA", [item("SRV", "5102", 1000, 0)])], catalogo, regra).creditoPresumido,
  0
);
conferir(
  "nota cancelada é ignorada",
  apurarCreditoPresumido([doc("SAIDA", [item("SRV", "5102", 1000, 205)], true)], catalogo, regra).creditoPresumido,
  0
);

// --- restrição por CFOP ------------------------------------------------------
const soVenda: RegraCreditoPresumido = { ...regra, cfops: ["5102"] };
conferir(
  "CFOP na lista entra",
  apurarCreditoPresumido([doc("SAIDA", [item("SRV", "5102", 1000, 205)])], catalogo, soVenda).creditoPresumido,
  125.28
);
conferir(
  "CFOP fora da lista não entra (ex.: transferência 5152)",
  apurarCreditoPresumido([doc("SAIDA", [item("SRV", "5152", 1000, 205)])], catalogo, soVenda).creditoPresumido,
  0
);

// --- estorno das entradas ----------------------------------------------------
const comEntrada = apurarCreditoPresumido(
  [doc("SAIDA", [item("SRV", "5102", 1000, 205)]), doc("ENTRADA", [item("NOTE", "2102", 500, 60)])],
  catalogo,
  regra
);
conferir("estorno é o mesmo percentual sobre o crédito da entrada", comEntrada.estornoCredito, 36.67); // 60 × 61,11%
conferir("crédito da saída não é afetado pela entrada", comEntrada.creditoPresumido, 125.28);

const entradaSemCredito = apurarCreditoPresumido(
  [doc("SAIDA", [item("SRV", "5102", 1000, 205)]), doc("ENTRADA", [item("TONER", "6102", 1048.5, 0)])],
  catalogo,
  regra
);
conferir("entrada sem crédito tomado não gera estorno", entradaSemCredito.estornoCredito, 0);

// --- o que o usuário precisa conferir ---------------------------------------
const comAnexoMaior = apurarCreditoPresumido([doc("SAIDA", [item("SRV", "5102", 1000, 205)])], catalogo, {
  ...regra,
  ncms: ["84715010", "84713019", "85176262", "84433210"]
});
conferir("lista os NCM que apareceram nas saídas", comAnexoMaior.ncmsNasSaidas, ["84715010"]);
conferir("lista os NCM do anexo sem movimento", comAnexoMaior.ncmsSemMovimento, ["84713019", "84433210", "85176262"].sort());

// --- outubro/2026 da Valleteclab (dados reais da apuração) -------------------
// Três NCM de informática, todos em CFOP 5102 a 20,5%, e nenhuma entrada com crédito de
// produto do anexo (o toner entrou como uso/consumo, sem crédito).
const outubro = apurarCreditoPresumido(
  [
    doc("SAIDA", [item("SRV", "5102", 100480.0, 20598.4)]),
    doc("SAIDA", [item("NOTE", "5102", 17899.98, 3669.5)]),
    doc("SAIDA", [item("SWT", "5102", 7985.0, 1636.93)]),
    doc("ENTRADA", [item("TONER", "6102", 4194.0, 0)]),
    doc("ENTRADA", [item("BRITA", "5102", 1000.0, 205)])
  ],
  catalogo,
  regra
);
conferir("Valleteclab out/2026: ICMS das saídas contempladas", outubro.icmsSaidasContempladas, 25904.83);
conferir("Valleteclab out/2026: crédito presumido", outubro.creditoPresumido, 15830.44);
conferir("Valleteclab out/2026: estorno zero", outubro.estornoCredito, 0);
conferir("Valleteclab out/2026: valor das saídas contempladas", outubro.valorSaidasContempladas, 126364.98);

// O ICMS a recolher sai de 25.398,68 para 9.568,24 (débito − crédito presumido − créditos −
// saldo credor anterior). É o efeito que o benefício tem no E110.
const aRecolherAntes = 25904.83 - 390.43 - 115.72;
const aRecolherDepois = 25904.83 - outubro.creditoPresumido + outubro.estornoCredito - 390.43 - 115.72;
conferir("ICMS a recolher antes do benefício", Math.round(aRecolherAntes * 100) / 100, 25398.68);
conferir("ICMS a recolher com o benefício", Math.round(aRecolherDepois * 100) / 100, 9568.24);

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} caso(s) com falha.`);
process.exit(falhas === 0 ? 0 : 1);

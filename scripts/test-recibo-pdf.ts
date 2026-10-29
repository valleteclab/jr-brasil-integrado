/**
 * Gera o PDF do recibo para conferência visual (sem rede/banco).
 * Uso: OUT=<pasta> npx tsx scripts/test-recibo-pdf.ts
 */
import fs from "node:fs";
import assert from "node:assert/strict";
import { gerarReciboPdf } from "../src/lib/pdf/recibo-pdf";

const base = {
  numero: 1,
  empresa: {
    razaoSocial: "VALLETECLAB EMPREENDIMENTOS LTDA",
    cnpj: "15130181000148",
    endereco: "Rua A, 100 - Centro - Lauro de Freitas/BA",
    logoDataUrl: null
  },
  favorecido: { nome: "João Ulisses Barreto Dourado", documento: "67547147000100" },
  dataPagamento: new Date(2026, 9, 14),
  formaPagamento: "PIX",
  cidade: "Lauro de Freitas",
  observacao: null as string | null
};

async function main() {
  // Texto curto e texto LONGO: é o longo que empurrava a assinatura por cima do conteúdo.
  const curto = await gerarReciboPdf({ ...base, valor: 1000, referente: "serviços prestados" });
  const longo = await gerarReciboPdf({
    ...base,
    numero: 2,
    valor: 296887.13,
    referente:
      "execução da 4ª medição do contrato 006/2026 de implantação de sistema de microgeração de energia solar " +
      "fotovoltaica on-grid, conforme planilha contratual e cronograma físico-financeiro anexos, incluindo mão de obra " +
      "especializada, fundações, estruturas de fixação e comissionamento do sistema",
    observacao: "Pagamento referente ao mês de outubro, conforme medição aprovada pela fiscalização do contrato."
  });

  for (const [nome, pdf] of [["curto", curto], ["longo", longo]] as const) {
    assert.ok(pdf.subarray(0, 4).toString("latin1") === "%PDF", `${nome}: não gerou PDF`);
    assert.ok(pdf.length > 1000, `${nome}: PDF suspeito de vazio`);
    // Uma folha só: as duas vias precisam caber em A4.
    const paginas = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    assert.equal(paginas, 1, `${nome}: o recibo deve caber em uma folha (gerou ${paginas})`);
    if (process.env.OUT) fs.writeFileSync(`${process.env.OUT}/recibo-${nome}.pdf`, pdf);
  }

  console.log(`Recibo: PDF de uma folha com texto curto e longo (${curto.length} e ${longo.length} bytes). OK`);
}

void main();

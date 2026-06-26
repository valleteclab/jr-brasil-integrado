/**
 * Harness da F1 — exercita o NacionalFiscalProvider.emit a partir de um NormalizedFiscalDocument
 * (como a emissão real monta), enviando à produção restrita com o A1 da empresa. Valida que o
 * buildDpsXml (do nosso modelo) gera um DPS schema-válido e que assinatura+mTLS funcionam.
 *
 * Uso: PFX_PATH=... PFX_PASS=... tsx scripts/nfse-nacional-emit-test.ts
 */
import { readFileSync } from "node:fs";
import { NacionalFiscalProvider } from "@/domains/fiscal/providers/nacional-provider";
import type { EmitInput, ProviderContext } from "@/domains/fiscal/providers/types";
import type { NormalizedFiscalDocument } from "@/domains/fiscal/types";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Defina ${name}`);
  return v;
}

const document = {
  modelo: "NFSE",
  finalidade: "NORMAL",
  naturezaOperacao: "Prestacao de servico",
  ambiente: "HOMOLOGACAO",
  provedor: "NACIONAL",
  serie: "900",
  destinatario: {
    nome: "TOMADOR DE TESTE LTDA",
    documento: "11444777000161",
    inscricaoEstadual: null,
    email: null,
    uf: "BA",
    endereco: null
  },
  formaPagamento: null,
  condicaoPagamento: null,
  informacoesComplementares: "Teste F1 — emissao via provider NACIONAL.",
  valorFrete: 0, valorSeguro: 0, valorDesconto: 0, outrasDespesas: 0,
  itens: [
    {
      produtoId: null, codigo: "SERV", descricao: "Servico de teste F1 provider nacional",
      ncm: null, cest: null, cfop: null, unidade: "UN", quantidade: 1,
      valorUnitario: 100, valorTotal: 100, desconto: 0, origem: null, regraTributariaId: null,
      servico: true, itemListaServico: "010101", codigoNbs: "115019000",
      cClassTribServico: null, aliquotaIssInformada: 5, baseIssInformada: null
    }
  ],
  retencoes: null,
  taxationType: null,
  obra: null,
  substituicao: null
} as unknown as NormalizedFiscalDocument;

const input = {
  document,
  emitter: {
    razaoSocial: "VALLETECLAB EMPREENDIMENTOS LTDA",
    cnpj: process.env.EMIT_CNPJ || "15130181000148",
    inscricaoEstadual: null,
    inscricaoMunicipal: process.env.EMIT_IM || "987654",
    uf: "BA",
    codigoMunicipioIbge: process.env.COD_MUN || "2919553",
    regime: process.env.REGIME || "LUCRO_PRESUMIDO"
  },
  numero: 1,
  totals: { valorServicos: 100, valorIss: 5 } as never,
  total: 100,
  integrationId: "f1-test",
  computed: []
} as unknown as EmitInput;

const ctx = {
  ambiente: "HOMOLOGACAO",
  provedor: "NACIONAL",
  baseUrl: null, token: null, cscId: null, cscToken: null,
  certificado: { pfx: readFileSync(req("PFX_PATH")), senha: req("PFX_PASS") }
} as unknown as ProviderContext;

async function main() {
  const provider = new NacionalFiscalProvider();
  const res = await provider.emit(input, ctx);
  console.log("\n=== RESULTADO emit() ===");
  console.log(JSON.stringify(res, null, 2));
}

main().catch((e) => { console.error("ERRO:", e instanceof Error ? e.message : e); process.exit(1); });

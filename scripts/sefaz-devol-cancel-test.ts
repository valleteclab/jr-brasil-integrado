/** Testa DEVOLUCAO (NF-e entrada finNFe=4 ref a original) e CANCELAMENTO (evento 110111) na SEFAZ-BA homolog. */
import { readFileSync } from "node:fs";
import { SefazFiscalProvider } from "../src/domains/fiscal/providers/sefaz-provider";
import type { EmitInput, ProviderContext } from "../src/domains/fiscal/providers/types";

const req = (n: string) => { const v = process.env[n]; if (!v) throw new Error(`Defina ${n}`); return v; };
const provider = new SefazFiscalProvider();
const ctx = { ambiente: "HOMOLOGACAO", provedor: "SEFAZ", baseUrl: null, token: null, cscId: null, cscToken: null,
  ufEmitente: "BA", certificado: { pfx: readFileSync(req("PFX_PATH")), senha: req("PFX_PASS") } } as unknown as ProviderContext;

const emitter = {
  razaoSocial: "VALLETECLAB EMPREENDIMENTOS LTDA", cnpj: "15130181000148", inscricaoEstadual: "100063019",
  inscricaoMunicipal: null, uf: "BA", codigoMunicipioIbge: "2919553", regime: "SIMPLES_NACIONAL", nomeFantasia: "VALLETECLAB",
  logradouro: "RUA CASTRO ALVES", numero: "1473", complemento: "SALA 10", bairro: "CENTRO", cidade: "Luis Eduardo Magalhaes", cep: "47850011", telefone: "77998755764"
};
const taxes = { origem: "0", cstIcms: null, csosn: "102", baseIcms: 0, aliquotaIcms: 0, valorIcms: 0, percentualFcp: 0, valorFcp: 0,
  modalidadeBcSt: null, percentualMva: 0, baseIcmsSt: 0, aliquotaIcmsSt: 0, valorIcmsSt: 0, cstIpi: null, aliquotaIpi: 0, valorIpi: 0,
  cstPis: "49", aliquotaPis: 0, valorPis: 0, cstCofins: "49", aliquotaCofins: 0, valorCofins: 0, itemListaServico: null, aliquotaIss: 0, valorIss: 0,
  baseIbsCbs: 0, aliquotaIbs: 0, valorIbs: 0, aliquotaCbs: 0, valorCbs: 0, aliquotaIs: 0, valorIs: 0, valorTributos: 0, cClassTrib: null };

function devolucaoInput(numero: number, chaveRef: string): EmitInput {
  return {
    numero, total: 250.0, integrationId: "sefaz-devol", emitter,
    totals: { valorProdutos: 250, valorServicos: 0, valorDesconto: 0, valorIcms: 0, valorIcmsSt: 0, valorFcp: 0, valorIpi: 0, valorPis: 0, valorCofins: 0, valorIss: 0, valorIbs: 0, valorCbs: 0, valorIs: 0, valorTotalTributos: 0 },
    document: {
      modelo: "NFE", finalidade: "DEVOLUCAO", naturezaOperacao: "DEVOLUCAO DE VENDA",
      ambiente: "HOMOLOGACAO", provedor: "SEFAZ", serie: "1", chaveReferenciada: chaveRef,
      destinatario: { nome: "Cliente Teste", documento: "11444777000161", inscricaoEstadual: null, email: null, uf: "BA",
        endereco: { logradouro: "Av Sete de Setembro", numero: "200", complemento: null, bairro: "Centro", cep: "40010000", cidade: "Salvador", uf: "BA", codigoMunicipioIbge: "2927408" } },
      formaPagamento: "Dinheiro", condicaoPagamento: null, pagamentos: null, informacoesComplementares: null,
      valorFrete: 0, modalidadeFrete: 9, valorSeguro: 0, valorDesconto: 0, outrasDespesas: 0,
      itens: [{ produtoId: null, codigo: "P1", descricao: "Produto de Teste", ncm: "61091000", cest: null, cfop: "1202",
        unidade: "UN", quantidade: 2, valorUnitario: 125, valorTotal: 250, desconto: 0, origem: "0", regraTributariaId: null, servico: false, itemListaServico: null }]
    },
    computed: [{ numeroItem: 1, cfop: "1202", taxes }]
  } as unknown as EmitInput;
}

async function main() {
  const original = req("CHAVE_ORIGINAL");
  console.log("== 1) DEVOLUCAO (entrada finNFe=4, ref " + original.slice(-8) + ") ==");
  const dev = await provider.emit(devolucaoInput(Number(process.env.NUM_DEV || "99002"), original), ctx);
  console.log(JSON.stringify(dev, (k, v) => k === "xml" ? "[xml]" : v, 1));

  console.log("\n== 2) CANCELAMENTO da original ==");
  const can = await provider.cancel({ modelo: "NFE", chaveAcesso: original, providerRef: original, justificativa: "Cancelamento de NF-e de teste em homologacao; sem valor fiscal." }, ctx);
  console.log(JSON.stringify(can, null, 1));
}
main().catch((e) => { console.error("ERRO:", e instanceof Error ? e.message : e); process.exit(1); });

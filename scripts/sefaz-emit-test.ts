/** Emissao de NF-e 55 de TESTE em homologacao na SEFAZ-BA (A1 real). Mostra o cStat de resposta. */
import { readFileSync } from "node:fs";
import { SefazFiscalProvider } from "../src/domains/fiscal/providers/sefaz-provider";
import type { EmitInput, ProviderContext } from "../src/domains/fiscal/providers/types";

const req = (n: string) => { const v = process.env[n]; if (!v) throw new Error(`Defina ${n}`); return v; };

const input: EmitInput = {
  numero: Number(process.env.NUM || "1"), total: 250.0, integrationId: "sefaz-emit-test",
  emitter: {
    razaoSocial: "VALLETECLAB EMPREENDIMENTOS LTDA", cnpj: "15130181000148",
    inscricaoEstadual: process.env.IE || "1234567", inscricaoMunicipal: null, uf: "BA",
    codigoMunicipioIbge: "2919553", regime: "SIMPLES_NACIONAL", nomeFantasia: "VALLETECLAB",
    logradouro: "RUA CASTRO ALVES", numero: "1473", complemento: "SALA 10", bairro: "CENTRO",
    cidade: "Luis Eduardo Magalhaes", cep: "47850011", telefone: "77998755764"
  },
  totals: { valorProdutos: 250, valorServicos: 0, valorDesconto: 0, valorIcms: 0, valorIcmsSt: 0, valorFcp: 0, valorIpi: 0, valorPis: 0, valorCofins: 0, valorIss: 0, valorIbs: 0, valorCbs: 0, valorIs: 0, valorTotalTributos: 0 },
  document: {
    modelo: "NFE", finalidade: "NORMAL", naturezaOperacao: "VENDA DE MERCADORIA",
    ambiente: "HOMOLOGACAO", provedor: "SEFAZ", serie: "1", chaveReferenciada: null,
    destinatario: { nome: "Cliente Teste", documento: "11444777000161", inscricaoEstadual: null, email: null, uf: "BA",
      endereco: { logradouro: "Av Sete de Setembro", numero: "200", complemento: null, bairro: "Centro", cep: "40010000", cidade: "Salvador", uf: "BA", codigoMunicipioIbge: "2927408" } },
    formaPagamento: "Dinheiro", condicaoPagamento: null, pagamentos: null, informacoesComplementares: null,
    valorFrete: 0, modalidadeFrete: 9, valorSeguro: 0, valorDesconto: 0, outrasDespesas: 0,
    itens: [{ produtoId: null, codigo: "P1", descricao: "Produto de Teste", ncm: "61091000", cest: null, cfop: "5102",
      unidade: "UN", quantidade: 2, valorUnitario: 125, valorTotal: 250, desconto: 0, origem: "0", regraTributariaId: null, servico: false, itemListaServico: null }]
  },
  computed: [{ numeroItem: 1, cfop: "5102", taxes: {
    origem: "0", cstIcms: null, csosn: "102", baseIcms: 0, aliquotaIcms: 0, valorIcms: 0, percentualFcp: 0, valorFcp: 0,
    modalidadeBcSt: null, percentualMva: 0, baseIcmsSt: 0, aliquotaIcmsSt: 0, valorIcmsSt: 0,
    cstIpi: null, aliquotaIpi: 0, valorIpi: 0, cstPis: "49", aliquotaPis: 0, valorPis: 0,
    cstCofins: "49", aliquotaCofins: 0, valorCofins: 0, itemListaServico: null, aliquotaIss: 0, valorIss: 0,
    baseIbsCbs: 0, aliquotaIbs: 0, valorIbs: 0, aliquotaCbs: 0, valorCbs: 0, aliquotaIs: 0, valorIs: 0, valorTributos: 0, cClassTrib: null } }]
} as unknown as EmitInput;

const ctx = { ambiente: "HOMOLOGACAO", provedor: "SEFAZ", baseUrl: null, token: null, cscId: null, cscToken: null,
  ufEmitente: "BA", certificado: { pfx: readFileSync(req("PFX_PATH")), senha: req("PFX_PASS") } } as unknown as ProviderContext;

new SefazFiscalProvider().emit(input, ctx).then((r) => console.log(JSON.stringify(r, (k, v) => k === "xml" ? "[xml omitido]" : v, 1)));

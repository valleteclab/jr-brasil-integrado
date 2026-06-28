/** Emissão de NFC-e (mod 65) de TESTE na SVRS (A1 real + CSC). CSC via env NFCE_CSC (nunca commitar). */
import { readFileSync } from "node:fs";
import type { EmitInput, ProviderContext } from "../src/domains/fiscal/providers/types";
import { SefazFiscalProvider } from "../src/domains/fiscal/providers/sefaz-provider";
const req = (n: string) => { const v = process.env[n]; if (!v) throw new Error(`Defina ${n}`); return v; };



const input: EmitInput = {
  numero: 1, total: 250.0, integrationId: "nfce-val",
  emitter: {
    cnpj: "15130181000148", razaoSocial: "VALLETECLAB EMPREENDIMENTOS LTDA", inscricaoEstadual: "100063019",
    inscricaoMunicipal: null, uf: "BA", codigoMunicipioIbge: "2919553", regime: "LUCRO_PRESUMIDO",
    nomeFantasia: "VALLETECLAB", logradouro: "RUA CASTRO ALVES", numero: "1473", complemento: null,
    bairro: "CENTRO", cidade: "Luis Eduardo Magalhaes", cep: "47850011", telefone: "77998755764"
  },
  totals: { valorProdutos: 250, valorServicos: 0, valorDesconto: 0, valorIcms: 51.25, valorIcmsSt: 0, valorFcp: 0,
    valorIpi: 0, valorPis: 1.63, valorCofins: 7.5, valorIss: 0, valorIbs: 0.25, valorCbs: 2.25, valorIs: 0, valorTotalTributos: 0 },
  document: {
    modelo: "NFCE", finalidade: "NORMAL", naturezaOperacao: "VENDA AO CONSUMIDOR",
    ambiente: "HOMOLOGACAO", provedor: "SEFAZ", serie: "1", chaveReferenciada: null,
    destinatario: { nome: "CONSUMIDOR", documento: "", inscricaoEstadual: null, email: null, uf: "BA", endereco: null },
    formaPagamento: "Dinheiro", condicaoPagamento: null, pagamentos: null, informacoesComplementares: null,
    valorFrete: 0, modalidadeFrete: 9, valorSeguro: 0, valorDesconto: 0, outrasDespesas: 0,
    itens: [{ produtoId: null, codigo: "P1", descricao: "Produto Teste", ncm: "61091000", cest: null, cfop: "5102",
      unidade: "UN", quantidade: 2, valorUnitario: 125, valorTotal: 250, desconto: 0, origem: "0", regraTributariaId: null, servico: false, itemListaServico: null }]
  },
  computed: [{ numeroItem: 1, cfop: "5102", taxes: {
    origem: "0", cstIcms: "00", csosn: null, baseIcms: 250, aliquotaIcms: 20.5, valorIcms: 51.25, percentualFcp: 0, valorFcp: 0,
    modalidadeBcSt: null, percentualMva: 0, baseIcmsSt: 0, aliquotaIcmsSt: 0, valorIcmsSt: 0,
    cstIpi: null, aliquotaIpi: 0, valorIpi: 0, cstPis: "01", aliquotaPis: 0.65, valorPis: 1.63,
    cstCofins: "01", aliquotaCofins: 3, valorCofins: 7.5, itemListaServico: null, aliquotaIss: 0, valorIss: 0,
    baseIbsCbs: 250, aliquotaIbs: 0.1, valorIbs: 0.25, aliquotaCbs: 0.9, valorCbs: 2.25, aliquotaIs: 0, valorIs: 0, valorTributos: 0, cClassTrib: "000001", cstIbsCbs: "000" } }]
} as unknown as EmitInput;


const ctx = { ambiente: "HOMOLOGACAO", provedor: "SEFAZ", baseUrl: null, token: null, cscId: null, cscToken: null,
  ufEmitente: "BA", nfceIdCsc: process.env.NFCE_IDCSC || "1", nfceCsc: req("NFCE_CSC"),
  certificado: { pfx: readFileSync(process.env.PFX_PATH!), senha: process.env.PFX_PASS! } } as unknown as ProviderContext;
input.numero = Number(process.env.NUM || "1");
new SefazFiscalProvider().emit(input, ctx).then((r) => console.log(JSON.stringify(r, (k, v) => k === "xml" ? "[xml]" : v, 1)));

/** Gera uma NF-e com o grupo IBS/CBS (Reforma) e salva o XML para validar contra o XSD oficial. */
import { writeFileSync } from "node:fs";
import forge from "node-forge";
import type { EmitInput } from "../src/domains/fiscal/providers/types";
import { buildNfeXml } from "../src/domains/fiscal/providers/sefaz/nfe-xml";
import { signNfe } from "../src/domains/fiscal/providers/sefaz/sign";

function selfSigned() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(2020, 0, 1);
  cert.validity.notAfter = new Date(2030, 0, 1);
  const attrs = [{ name: "commonName", value: "PoC" }];
  cert.setSubject(attrs); cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey), certPem: forge.pki.certificateToPem(cert) };
}

const input: EmitInput = {
  numero: 123, total: 250.0, integrationId: "val-1",
  emitter: {
    cnpj: "15130181000148", razaoSocial: "Empresa Teste LTDA", inscricaoEstadual: "1234567",
    inscricaoMunicipal: null, uf: "BA", codigoMunicipioIbge: "2927408", regime: "LUCRO_PRESUMIDO",
    nomeFantasia: "Teste", logradouro: "Rua das Flores", numero: "100", complemento: null,
    bairro: "Centro", cidade: "Salvador", cep: "40010000", telefone: "7122223333"
  },
  totals: { valorProdutos: 250, valorServicos: 0, valorDesconto: 0, valorIcms: 45, valorIcmsSt: 0, valorFcp: 0,
    valorIpi: 0, valorPis: 0, valorCofins: 0, valorIss: 0, valorIbs: 0.25, valorCbs: 2.25, valorIs: 0, valorTotalTributos: 0 },
  document: {
    modelo: "NFE", finalidade: "NORMAL", naturezaOperacao: "VENDA DE MERCADORIA",
    ambiente: "HOMOLOGACAO", provedor: "SEFAZ", serie: "1", chaveReferenciada: null,
    destinatario: { nome: "Cliente Teste", documento: "11444777000161", inscricaoEstadual: null, email: null, uf: "BA",
      endereco: { logradouro: "Av Sete de Setembro", numero: "200", complemento: null, bairro: "Centro", cep: "40010000", cidade: "Salvador", uf: "BA", codigoMunicipioIbge: "2927408" } },
    formaPagamento: "Dinheiro", condicaoPagamento: null, pagamentos: null,
    informacoesComplementares: null, valorFrete: 0, modalidadeFrete: 9, valorSeguro: 0, valorDesconto: 0, outrasDespesas: 0,
    itens: [{ produtoId: null, codigo: "P1", descricao: "Produto de Teste", ncm: "61091000", cest: null, cfop: "5102",
      unidade: "UN", quantidade: 2, valorUnitario: 125, valorTotal: 250, desconto: 0, origem: "0",
      regraTributariaId: null, servico: false, itemListaServico: null }]
  },
  computed: [{
    numeroItem: 1, cfop: "5102",
    taxes: {
      origem: "0", cstIcms: "00", csosn: null, baseIcms: 250, aliquotaIcms: 18, valorIcms: 45, percentualFcp: 0, valorFcp: 0,
      modalidadeBcSt: null, percentualMva: 0, baseIcmsSt: 0, aliquotaIcmsSt: 0, valorIcmsSt: 0,
      cstIpi: null, aliquotaIpi: 0, valorIpi: 0, cstPis: "01", aliquotaPis: 0.65, valorPis: 1.63,
      cstCofins: "01", aliquotaCofins: 3, valorCofins: 7.5, itemListaServico: null, aliquotaIss: 0, valorIss: 0,
      baseIbsCbs: 250, aliquotaIbs: 0.1, valorIbs: 0.25, aliquotaCbs: 0.9, valorCbs: 2.25, aliquotaIs: 0, valorIs: 0,
      valorTributos: 0, cClassTrib: "000001", cstIbsCbs: "000"
    }
  }]
} as unknown as EmitInput;

const { xml } = buildNfeXml(input);
const { privateKeyPem, certPem } = selfSigned();
const signed = signNfe(xml, privateKeyPem, certPem);
// Saída fora do repo (scratchpad). Valide com:
//   python -c "from lxml import etree; x=etree.XMLSchema(etree.parse('docs/xsd-nt2025002/wrap-nfe.xsd')); print('VALIDO' if x.validate(etree.parse(OUT)) else list(x.error_log))"
const out = process.env.OUT || "scripts/_nfe-reforma.xml";
writeFileSync(out, signed);
const m = /<IBSCBS>.*?<\/IBSCBS>/.exec(xml);
const t = /<IBSCBSTot>.*?<\/IBSCBSTot>/.exec(xml);
console.log("ITEM:", m?.[0]);
console.log("TOT :", t?.[0]);
console.log("salvo em", out);

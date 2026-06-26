/**
 * PoC offline da F1 — monta a NF-e (modelo 55, leiaute 4.00), valida a chave de acesso + dígito
 * verificador e ASSINA com um certificado self-signed (sem A1 real nem rede). Prova a mecânica de
 * chave + serialização + XMLDSig antes do teste real em homologação.
 *
 * Uso:  tsx scripts/sefaz-nfe-poc.ts
 *
 * Para o envio REAL em homologação use a emissão do app (provedor SEFAZ) ou o script de status
 * (scripts/sefaz-status-test.ts) — aqui o foco é validar o XML/assinatura isoladamente.
 */
import forge from "node-forge";
import type { EmitInput } from "../src/domains/fiscal/providers/types";
import { buildNfeXml } from "../src/domains/fiscal/providers/sefaz/nfe-xml";
import { signNfe } from "../src/domains/fiscal/providers/sefaz/sign";
import { calcDV } from "../src/domains/fiscal/providers/sefaz/chave";

/** Gera um par self-signed (apenas para exercitar a assinatura localmente). */
function selfSigned(): { privateKeyPem: string; certPem: string } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(2020, 0, 1);
  cert.validity.notAfter = new Date(2030, 0, 1);
  const attrs = [{ name: "commonName", value: "PoC NFe" }, { name: "organizationName", value: "Teste" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey), certPem: forge.pki.certificateToPem(cert) };
}

const sampleInput: EmitInput = {
  numero: 123,
  total: 250.0,
  integrationId: "poc-1",
  emitter: {
    razaoSocial: "Empresa Teste LTDA",
    cnpj: "15130181000148",
    inscricaoEstadual: "1234567",
    inscricaoMunicipal: null,
    uf: "RJ",
    codigoMunicipioIbge: "3304557",
    regime: "SIMPLES_NACIONAL",
    nomeFantasia: "Teste",
    logradouro: "Rua das Flores",
    numero: "100",
    complemento: null,
    bairro: "Centro",
    cidade: "Rio de Janeiro",
    cep: "20040002",
    telefone: "2122223333"
  },
  totals: {
    valorProdutos: 250, valorServicos: 0, valorDesconto: 0, valorIcms: 0, valorIcmsSt: 0, valorFcp: 0,
    valorIpi: 0, valorPis: 0, valorCofins: 0, valorIss: 0, valorIbs: 0, valorCbs: 0, valorIs: 0, valorTotalTributos: 0
  },
  document: {
    modelo: "NFE", finalidade: "NORMAL", naturezaOperacao: "VENDA DE MERCADORIA",
    ambiente: "HOMOLOGACAO", provedor: "SEFAZ", serie: "1", chaveReferenciada: null,
    destinatario: {
      nome: "Cliente Teste", documento: "11444777000161", inscricaoEstadual: null, email: null, uf: "RJ",
      endereco: { logradouro: "Av Brasil", numero: "200", complemento: null, bairro: "Centro", cep: "20040002", cidade: "Rio de Janeiro", uf: "RJ", codigoMunicipioIbge: "3304557" }
    },
    formaPagamento: "Dinheiro", condicaoPagamento: null, pagamentos: null,
    informacoesComplementares: null, valorFrete: 0, modalidadeFrete: 9, valorSeguro: 0,
    valorDesconto: 0, outrasDespesas: 0,
    itens: [{
      produtoId: null, codigo: "P1", descricao: "Produto de Teste", ncm: "61091000", cest: null, cfop: "5102",
      unidade: "UN", quantidade: 2, valorUnitario: 125, valorTotal: 250, desconto: 0, origem: "0",
      regraTributariaId: null, servico: false, itemListaServico: null
    }]
  },
  computed: [{
    numeroItem: 1, cfop: "5102",
    taxes: {
      origem: "0", cstIcms: null, csosn: "102", baseIcms: 0, aliquotaIcms: 0, valorIcms: 0, percentualFcp: 0, valorFcp: 0,
      modalidadeBcSt: null, percentualMva: 0, baseIcmsSt: 0, aliquotaIcmsSt: 0, valorIcmsSt: 0,
      cstIpi: null, aliquotaIpi: 0, valorIpi: 0, cstPis: "49", aliquotaPis: 0, valorPis: 0,
      cstCofins: "49", aliquotaCofins: 0, valorCofins: 0, itemListaServico: null, aliquotaIss: 0, valorIss: 0,
      baseIbsCbs: 0, aliquotaIbs: 0, valorIbs: 0, aliquotaCbs: 0, valorCbs: 0, aliquotaIs: 0, valorIs: 0,
      valorTributos: 0, cClassTrib: null
    }
  }]
};

function main() {
  const { xml, chave, cDV, cNF } = buildNfeXml(sampleInput);

  // 1) Valida o dígito verificador recomputando-o sobre os 43 primeiros dígitos.
  const dvOk = calcDV(chave.slice(0, 43)) === cDV && chave.length === 44;
  console.log(`Chave (44): ${chave}`);
  console.log(`  cNF=${cNF} cDV=${cDV} → DV recomputado confere: ${dvOk ? "✅" : "❌"}`);
  if (chave.length !== 44 || !dvOk) process.exitCode = 2;

  // 2) Assina e confere que a Signature/DigestValue/SignatureValue foram inseridas.
  const { privateKeyPem, certPem } = selfSigned();
  const signed = signNfe(xml, privateKeyPem, certPem);
  const temSig = /<(?:\w+:)?Signature[\s>]/.test(signed) && /<DigestValue>/.test(signed) && /<SignatureValue>/.test(signed);
  const refOk = signed.includes(`URI="#NFe${chave}"`);
  console.log(`  Assinatura presente: ${temSig ? "✅" : "❌"} | Reference #NFe<chave>: ${refOk ? "✅" : "❌"}`);
  if (!temSig || !refOk) process.exitCode = 2;

  console.log("\n--- XML assinado (prévia) ---");
  console.log(signed.slice(0, 1200) + (signed.length > 1200 ? "\n... [truncado]" : ""));
}

main();

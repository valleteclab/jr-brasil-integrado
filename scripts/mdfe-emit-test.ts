/**
 * Harness MDF-e (F1): status do serviço + emissão de teste na HOMOLOGAÇÃO da SVRS
 * com o A1 real. Valida chave/leiaute/assinatura/gzip/transporte antes das telas.
 *
 * Uso: PFX_PATH=... PFX_PASS=... npx tsx scripts/mdfe-emit-test.ts [--emit]
 * (sem --emit: só consulta o status do serviço)
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  MDFE_ENDPOINTS, MDFE_WSDL, MDFE_SOAP_ACTION,
  buildMdfeXml, buildConsStatus, mdfeRecepcaoPayload, insertMdfeSupl, buildEventoMdfe, dhBrasilia
} from "@/domains/fiscal/providers/sefaz/mdfe/mdfe-xml";
import { soapEnvelope, postSoap, pickTag } from "@/domains/fiscal/providers/sefaz/soap";
import { signXml, pfxToPem } from "@/domains/fiscal/providers/sefaz/sign";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Defina ${name}`);
  return v;
}

const AMBIENTE = "HOMOLOGACAO" as const;
const cert = { pfx: readFileSync(req("PFX_PATH")), senha: req("PFX_PASS") };

async function status() {
  const msg = buildConsStatus(AMBIENTE);
  const env = soapEnvelope(MDFE_WSDL.status, msg).replace(/nfeDadosMsg/g, "mdfeDadosMsg");
  const res = await postSoap(MDFE_ENDPOINTS[AMBIENTE].status, env, cert, MDFE_SOAP_ACTION.status, 60000);
  console.log("STATUS:", res.statusCode, "| cStat:", pickTag(res.body, "cStat"), "|", pickTag(res.body, "xMotivo"));
}

async function emit() {
  const { xml, chave } = buildMdfeXml({
    ambiente: AMBIENTE,
    serie: 1,
    numero: Number(process.env.NUM || 1),
    emitente: {
      cnpj: process.env.EMIT_CNPJ || "15130181000148",
      inscricaoEstadual: process.env.EMIT_IE || "123456789",
      razaoSocial: "VALLETECLAB EMPREENDIMENTOS LTDA",
      uf: "BA",
      codigoMunicipioIbge: "2919553",
      municipio: "LUIS EDUARDO MAGALHAES",
      logradouro: "RUA TESTE", numeroEndereco: "100", bairro: "CENTRO", cep: "47850000"
    },
    ufInicio: "BA",
    ufFim: "BA",
    municipioCarregamento: { codigoIbge: "2919553", nome: "LUIS EDUARDO MAGALHAES" },
    veiculo: { placa: "ABC1D23", tara: 3500, tipoRodado: "06", tipoCarroceria: "02" },
    condutores: [{ nome: "MOTORISTA DE TESTE", cpf: "11144477735" }],
    descargas: [{ codigoIbge: "2903201", nome: "BARREIRAS", chavesNfe: [process.env.CH_NFE || "29260815130181000148550010000003741000003749"] }],
    valorCarga: 1500,
    pesoBrutoKg: 250,
    infoAdicional: "MDF-e de TESTE do XERP em homologacao."
  });
  console.log("chave:", chave);

  const { privateKeyPem, certPem } = pfxToPem(cert.pfx, cert.senha);
  const assinado = insertMdfeSupl(signXml(xml, "infMDFe", privateKeyPem, certPem), chave, AMBIENTE);
  writeFileSync(process.env.OUT || "mdfe-out.xml", assinado);

  const payload = mdfeRecepcaoPayload(assinado);
  const env = soapEnvelope(MDFE_WSDL.recepcaoSinc, payload).replace(/nfeDadosMsg/g, "mdfeDadosMsg");
  const res = await postSoap(MDFE_ENDPOINTS[AMBIENTE].recepcaoSinc, env, cert, MDFE_SOAP_ACTION.recepcaoSinc, 90000);
  const plain = res.body.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  console.log("EMIT:", res.statusCode, "| cStat:", pickTag(plain, "cStat"), "|", pickTag(plain, "xMotivo"));
  if (pickTag(plain, "nProt")) console.log("nProt:", pickTag(plain, "nProt"));
}

async function encerrar() {
  const chave = req("CH_MDFE");
  const nProt = req("N_PROT");
  const { xml } = buildEventoMdfe({
    ambiente: AMBIENTE,
    chave,
    cnpj: process.env.EMIT_CNPJ || "15130181000148",
    evento: { tipo: "ENCERRAMENTO", nProt, dtEnc: dhBrasilia().slice(0, 10), cUf: "29", cMun: "2903201" }
  });
  const { privateKeyPem, certPem } = pfxToPem(cert.pfx, cert.senha);
  const assinado = signXml(xml, "infEvento", privateKeyPem, certPem).replace(/^<\?xml[^>]*\?>/, "");
  const env = soapEnvelope(MDFE_WSDL.evento, assinado).replace(/nfeDadosMsg/g, "mdfeDadosMsg");
  const res = await postSoap(MDFE_ENDPOINTS[AMBIENTE].evento, env, cert, MDFE_SOAP_ACTION.evento, 60000);
  const plain = res.body.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  console.log("ENCERRAR:", res.statusCode, "| cStat:", pickTag(plain, "cStat"), "|", pickTag(plain, "xMotivo"));
}

(async () => {
  await status();
  if (process.argv.includes("--emit")) await emit();
  if (process.argv.includes("--encerrar")) await encerrar();
})().catch((e) => { console.error("ERRO:", e instanceof Error ? e.message : e); process.exit(1); });

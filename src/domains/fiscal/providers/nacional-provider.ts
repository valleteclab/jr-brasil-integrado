/**
 * Provedor NACIONAL — emissão de NFS-e DIRETO na SEFIN (Sistema Nacional NFS-e), sem intermediário.
 * Só NFS-e: NF-e/NFC-e continuam pelo ACBr (roteamento por modelo na camada de emissão).
 *
 * Fluxo (validado na PoC, ver scripts/nfse-nacional-poc.ts): monta o DPS em XML a partir do
 * NormalizedFiscalDocument (mesma regra fiscal do ACBr), ASSINA (XMLDSig enveloped + C14N +
 * RSA-SHA256, referência ao infDPS pelo Id), comprime (GZip) + Base64 e envia por mTLS com o A1
 * da empresa. F1 = núcleo de emissão; eventos/cancelamento/DANFSE entram na F4.
 */
import { gzipSync, gunzipSync } from "node:zlib";
import https from "node:https";
import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import type { AmbienteFiscal, ProvedorFiscal } from "@prisma/client";
import { cTribNacFromCodigo } from "@/domains/fiscal/codigo-tributacao-nacional";
import type {
  CancelInput, CancelResult, CorrectionInput, CorrectionResult,
  EmitInput, EmitResult, FiscalProvider, ProviderContext, TestConnectionResult
} from "./types";

const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";

const SEFIN: Record<AmbienteFiscal, string> = {
  PRODUCAO: "https://sefin.nfse.gov.br/SefinNacional",
  HOMOLOGACAO: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional"
};

const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const pad = (s: string | number, n: number) => onlyDigits(String(s)).padStart(n, "0").slice(-n);
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Sanitiza textos livres da NFS-e (xDescServ, xInfComp, xNome): só 0x20–0xFF, sem quebra/ponta. */
function sanitizeTextoNfse(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[\r\n\t\f\v]+/g, " ")
    .replace(/[‐-―−]/g, "-").replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"').replace(/…/g, "...")
    .replace(/[^\x20-\xFF]/g, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

/** dhEmi no fuso -03:00 (Brasília), com folga de 60s p/ não cair "no futuro" (regra E0008). */
function dhEmiBrasilia(): string {
  return new Date(Date.now() - 3 * 3600 * 1000 - 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "-03:00");
}

/** Id do infDPS = "DPS" + cMun(7) + tpInsc(1) + inscFed(14) + serie(5) + nDPS(15). */
function dpsId(cMun: string, cnpj: string, serie: string, nDPS: string): string {
  return `DPS${pad(cMun, 7)}2${pad(cnpj, 14)}${pad(serie, 5)}${pad(nDPS, 15)}`;
}

const fmt = (v: number) => (Math.round((v + Number.EPSILON) * 100) / 100).toFixed(2);

/** Monta o XML do DPS a partir do documento normalizado (mesma regra fiscal do ACBr, em XML). */
function buildDpsXml(input: EmitInput, ctx: ProviderContext): { xml: string; id: string } {
  const doc = input.document;
  const e = input.emitter;
  const cMun = pad(e.codigoMunicipioIbge ?? "", 7);
  const cnpjEmit = onlyDigits(e.cnpj);
  const serie = doc.serie?.trim() || "1";
  const nDPS = String(input.numero);
  const id = dpsId(cMun, cnpjEmit, serie, nDPS);
  const tpAmb = ctx.ambiente === "PRODUCAO" ? "1" : "2";

  // Serviço (1 grupo cServ — o nacional é um serviço por DPS).
  const servItem = doc.itens.find((i) => i.servico) ?? doc.itens[0];
  const cTribNac = cTribNacFromCodigo(servItem?.itemListaServico);
  const cNBS = onlyDigits(servItem?.codigoNbs);
  const xDescServ = sanitizeTextoNfse(doc.itens.map((i) => i.descricao).join("; ") || doc.naturezaOperacao) || "Servico";
  const vServ = fmt(input.totals.valorServicos || input.total);

  // Tributação municipal/federal.
  const ret = doc.retencoes ?? null;
  const issRetido = Boolean(ret?.issRetido);
  const tribFed =
    ret && (ret.ir || ret.csll || ret.pis || ret.cofins || ret.inss)
      ? `<tribFed>` +
          (ret.pis || ret.cofins ? `<piscofins><CST>00</CST><vPis>${fmt(ret.pis?.valor ?? 0)}</vPis><vCofins>${fmt(ret.cofins?.valor ?? 0)}</vCofins></piscofins>` : "") +
          (ret.inss ? `<vRetCP>${fmt(ret.inss.valor)}</vRetCP>` : "") +
          (ret.ir ? `<vRetIRRF>${fmt(ret.ir.valor)}</vRetIRRF>` : "") +
          (ret.csll ? `<vRetCSLL>${fmt(ret.csll.valor)}</vRetCSLL>` : "") +
        `</tribFed>`
      : "";
  const vTotFed = fmt((ret?.ir?.valor ?? 0) + (ret?.csll?.valor ?? 0) + (ret?.pis?.valor ?? 0) + (ret?.cofins?.valor ?? 0) + (ret?.inss?.valor ?? 0));
  const vISSQN = fmt(input.totals.valorIss || 0);

  // Tomador (opcional no nacional, mas mandamos quando há documento).
  const dest = doc.destinatario;
  const docToma = onlyDigits(dest.documento);
  const toma = docToma
    ? `<toma>${docToma.length === 14 ? `<CNPJ>${docToma}</CNPJ>` : `<CPF>${docToma}</CPF>`}<xNome>${esc(sanitizeTextoNfse(dest.nome))}</xNome></toma>`
    : "";

  // regTrib: opSimpNac (1=Simples, 2=não optante); regEspTrib 0=nenhum.
  const simples = e.regime === "SIMPLES_NACIONAL" || e.regime === "SIMPLES_EXCESSO_SUBLIMITE" || e.regime === "MEI";
  const opSimpNac = simples ? (e.regime === "MEI" ? "2" : "1") : "1"; // 1=Optante MEI? ajustar por NT; default optante

  const infDPS =
    `<infDPS Id="${id}">` +
      `<tpAmb>${tpAmb}</tpAmb>` +
      `<dhEmi>${dhEmiBrasilia()}</dhEmi>` +
      `<verAplic>ERP-1.0</verAplic>` +
      `<serie>${esc(serie)}</serie>` +
      `<nDPS>${esc(nDPS)}</nDPS>` +
      `<dCompet>${dhEmiBrasilia().slice(0, 10)}</dCompet>` +
      `<tpEmit>1</tpEmit>` +
      `<cLocEmi>${cMun}</cLocEmi>` +
      `<prest><CNPJ>${cnpjEmit}</CNPJ>${e.inscricaoMunicipal ? `<IM>${onlyDigits(e.inscricaoMunicipal)}</IM>` : ""}` +
        `<regTrib><opSimpNac>${opSimpNac}</opSimpNac><regEspTrib>0</regEspTrib></regTrib></prest>` +
      toma +
      `<serv><locPrest><cLocPrestacao>${cMun}</cLocPrestacao></locPrest>` +
        `<cServ><cTribNac>${cTribNac}</cTribNac><xDescServ>${esc(xDescServ)}</xDescServ>${cNBS.length === 9 ? `<cNBS>${cNBS}</cNBS>` : ""}</cServ></serv>` +
      `<valores><vServPrest><vServ>${vServ}</vServ></vServPrest>` +
        `<trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>${issRetido ? "2" : "1"}</tpRetISSQN></tribMun>` +
        tribFed +
        `<totTrib><vTotTrib><vTotTribFed>${vTotFed}</vTotTribFed><vTotTribEst>0.00</vTotTribEst><vTotTribMun>${vISSQN}</vTotTribMun></vTotTrib></totTrib>` +
        `</trib></valores>` +
    `</infDPS>`;
  return { xml: `<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">${infDPS}</DPS>`, id };
}

/** Lê o A1 .pfx → PEM (chave + cert) para assinar. */
function pfxToPem(pfx: Buffer, senha: string): { privateKeyPem: string; certPem: string } {
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(pfx.toString("binary"))), senha);
  const keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]
    ?? p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
  if (!keyBag?.key || !certBag?.cert) throw new Error("Certificado A1 sem chave privada ou certificado.");
  return { privateKeyPem: forge.pki.privateKeyToPem(keyBag.key), certPem: forge.pki.certificateToPem(certBag.cert) };
}

function signDps(xml: string, privateKeyPem: string, certPem: string): string {
  const certB64 = certPem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
  const sig = new SignedXml({
    privateKey: privateKeyPem, publicCert: certPem,
    signatureAlgorithm: RSA_SHA256, canonicalizationAlgorithm: C14N,
    getKeyInfoContent: () => `<X509Data><X509Certificate>${certB64}</X509Certificate></X509Data>`
  });
  sig.addReference({ xpath: "//*[local-name(.)='infDPS']", transforms: [ENVELOPED, C14N], digestAlgorithm: SHA256 });
  sig.computeSignature(xml, { location: { reference: "//*[local-name(.)='infDPS']", action: "after" } });
  return `<?xml version="1.0" encoding="UTF-8"?>${sig.getSignedXml()}`;
}

type SefinResp = { statusCode: number; body: string };

function postSefinNfse(baseUrl: string, dpsXmlGZipB64: string, cert: { pfx: Buffer; senha: string }): Promise<SefinResp> {
  const url = new URL(`${baseUrl}/nfse`);
  const payload = JSON.stringify({ dpsXmlGZipB64 });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: "POST", hostname: url.hostname, path: url.pathname,
        pfx: cert.pfx, passphrase: cert.senha,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

/** Extrai a chave de acesso (chNFSe, 50 díg.) da NFS-e retornada (XML GZip+Base64 ou chave direta). */
function chaveFromNfseB64(nfseXmlGZipB64: string | undefined): string | undefined {
  if (!nfseXmlGZipB64) return undefined;
  try {
    const xml = gunzipSync(Buffer.from(nfseXmlGZipB64, "base64")).toString("utf8");
    return /Id="NFS([0-9]{50})"/.exec(xml)?.[1] ?? /<chNFSe>(\d{50})<\/chNFSe>/.exec(xml)?.[1];
  } catch {
    return undefined;
  }
}

export class NacionalFiscalProvider implements FiscalProvider {
  readonly id: ProvedorFiscal = "NACIONAL" as ProvedorFiscal;

  async emit(input: EmitInput, ctx: ProviderContext): Promise<EmitResult> {
    if (input.document.modelo !== "NFSE") {
      return { status: "ERRO", motivo: "O provedor NACIONAL emite apenas NFS-e (NF-e/NFC-e seguem pelo ACBr)." };
    }
    if (!ctx.certificado?.pfx) {
      return { status: "ERRO", motivo: "Certificado A1 não disponível para assinar/transmitir a NFS-e nacional." };
    }
    const { xml } = buildDpsXml(input, ctx);
    const { privateKeyPem, certPem } = pfxToPem(ctx.certificado.pfx, ctx.certificado.senha);
    const signed = signDps(xml, privateKeyPem, certPem);
    const dpsXmlGZipB64 = gzipSync(Buffer.from(signed, "utf8")).toString("base64");

    const res = await postSefinNfse(SEFIN[ctx.ambiente], dpsXmlGZipB64, ctx.certificado);
    let data: { chaveAcesso?: string; nfseXmlGZipB64?: string; idDps?: string; erros?: Array<{ Codigo?: string; Descricao?: string; Complemento?: string }> } = {};
    try { data = JSON.parse(res.body); } catch { /* corpo não-JSON */ }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      const chave = data.chaveAcesso || chaveFromNfseB64(data.nfseXmlGZipB64);
      return { status: "AUTORIZADA", chaveAcesso: chave, providerRef: chave, xml: data.nfseXmlGZipB64 };
    }
    const motivo = (data.erros ?? []).map((x) => `${x.Codigo ?? ""} ${x.Descricao ?? ""}${x.Complemento ? ` (${x.Complemento})` : ""}`.trim()).join("; ")
      || `Falha na SEFIN (HTTP ${res.statusCode}).`;
    return { status: res.statusCode === 422 || res.statusCode === 400 ? "REJEITADA" : "ERRO", motivo };
  }

  // F4: eventos/cancelamento/substituição/consulta/DANFSE.
  async cancel(_input: CancelInput, _ctx: ProviderContext): Promise<CancelResult> {
    return { status: "ERRO", motivo: "Cancelamento NFS-e nacional ainda não implementado (F4)." };
  }
  async correct(_input: CorrectionInput, _ctx: ProviderContext): Promise<CorrectionResult> {
    return { status: "ERRO", motivo: "NFS-e nacional não tem carta de correção — use substituição." };
  }
  async queryStatus(_chaveAcesso: string, _ctx: ProviderContext): Promise<EmitResult> {
    return { status: "PROCESSANDO", motivo: "Consulta NFS-e nacional ainda não implementada (F4)." };
  }
  async testConnection(_ctx: ProviderContext): Promise<TestConnectionResult> {
    return { ok: false, message: "Teste de conexão NFS-e nacional ainda não implementado (F4)." };
  }
}

/** Exporto o builder para o harness/teste da F1 validar o DPS contra a produção restrita. */
export { buildDpsXml, signDps };

/**
 * PoC do EVENTO DE CANCELAMENTO da NFS-e nacional (e101101) — itera o leiaute do pedRegEvento
 * contra a produção restrita (igual fizemos com o DPS). Usa a chave da nota 51 (produção), que NÃO
 * existe na restrita: assim validamos o SCHEMA do evento sem cancelar nada de verdade — quando o
 * schema passar, o erro deixa de ser de leiaute e vira "NFS-e não localizada".
 *
 * Uso: PFX_PATH=... PFX_PASS=... CHAVE=<50> [AMB=HOMOLOGACAO|PRODUCAO] tsx scripts/nfse-nacional-cancel-poc.ts
 */
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import https from "node:https";
import forge from "node-forge";
import { SignedXml } from "xml-crypto";

const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";
const SEFIN: Record<string, string> = {
  PRODUCAO: "https://sefin.nfse.gov.br/SefinNacional",
  HOMOLOGACAO: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional",
};

const req = (n: string) => { const v = process.env[n]; if (!v) throw new Error(`Defina ${n}`); return v; };
const onlyDigits = (s: string) => s.replace(/\D/g, "");
const pfx = readFileSync(req("PFX_PATH"));
const senha = req("PFX_PASS");
const chave = onlyDigits(req("CHAVE"));
const amb = (process.env.AMB ?? "HOMOLOGACAO").toUpperCase();
const tpAmb = amb === "PRODUCAO" ? "1" : "2";
const cnpjAutor = "15130181000148";

function pfxToPem(buf: Buffer, pass: string) {
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(buf.toString("binary"))), pass);
  const keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]
    ?? p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
  return { privateKeyPem: forge.pki.privateKeyToPem(keyBag!.key as forge.pki.PrivateKey), certPem: forge.pki.certificateToPem(certBag!.cert as forge.pki.Certificate) };
}

function sign(xml: string, localName: string, privateKeyPem: string, certPem: string): string {
  const certB64 = certPem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
  const sig = new SignedXml({
    privateKey: privateKeyPem, publicCert: certPem,
    signatureAlgorithm: RSA_SHA256, canonicalizationAlgorithm: C14N,
    getKeyInfoContent: () => `<X509Data><X509Certificate>${certB64}</X509Certificate></X509Data>`,
  });
  sig.addReference({ xpath: `//*[local-name(.)='${localName}']`, transforms: [ENVELOPED, C14N], digestAlgorithm: SHA256 });
  sig.computeSignature(xml, { location: { reference: `//*[local-name(.)='${localName}']`, action: "after" } });
  return `<?xml version="1.0" encoding="UTF-8"?>${sig.getSignedXml()}`;
}

function dhBrasilia(): string {
  return new Date(Date.now() - 3 * 3600 * 1000 - 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "-03:00");
}

// Id do infPedReg (59 chars) = "PRE" + chNFSe(50) + tpEvento(6). Sem nSeqEvento no Id.
const tpEvento = "101101";
const nSeq = "1";
const id = `PRE${chave}${tpEvento}`;
const xMotivo = "Cancelamento de NFS-e emitida com erro nos dados do servico prestado.";

const infPedReg =
  `<infPedReg Id="${id}">` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    `<verAplic>ERP-1.0</verAplic>` +
    `<dhEvento>${dhBrasilia()}</dhEvento>` +
    `<CNPJAutor>${cnpjAutor}</CNPJAutor>` +
    `<chNFSe>${chave}</chNFSe>` +
    `<e101101>` +
      `<xDesc>Cancelamento de NFS-e</xDesc>` +
      `<cMotivo>1</cMotivo>` +
      `<xMotivo>${xMotivo}</xMotivo>` +
    `</e101101>` +
  `</infPedReg>`;
const xml = `<pedRegEvento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">${infPedReg}</pedRegEvento>`;

const { privateKeyPem, certPem } = pfxToPem(pfx, senha);
const signed = sign(xml, "infPedReg", privateKeyPem, certPem);
const pedidoRegistroEventoXmlGZipB64 = gzipSync(Buffer.from(signed, "utf8")).toString("base64");

const payload = JSON.stringify({ pedidoRegistroEventoXmlGZipB64 });
const url = new URL(`${SEFIN[amb]}/nfse/${chave}/eventos`);
console.log(`POST ${url.href}\nId=${id}\nambiente=${amb}\n`);

const r = https.request({ method: "POST", hostname: url.hostname, path: url.pathname, pfx, passphrase: senha,
  headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } },
  (res) => {
    let d = ""; res.on("data", (c) => (d += c));
    res.on("end", () => { console.log("HTTP", res.statusCode); try { console.log(JSON.stringify(JSON.parse(d), null, 1)); } catch { console.log(d.slice(0, 800)); } });
  });
r.on("error", (e) => console.error("ERR", e.message));
r.write(payload); r.end();

/**
 * PoC — integração DIRETA com a NFS-e Nacional (SEFIN Nacional), sem intermediário.
 *
 * Objetivo: validar a parte mais arriscada — montar o DPS, ASSINAR (XMLDSig ICP-Brasil:
 * enveloped + C14N + RSA-SHA256, referência ao infDPS pelo Id), comprimir (GZip) + Base64,
 * e enviar por mTLS para a produção restrita (homologação). Isolado do app de propósito.
 *
 * Uso:
 *   # 1) Offline: gera um certificado self-signed, monta o DPS, assina e VERIFICA a assinatura
 *   #    localmente (prova a mecânica de assinatura, sem depender de A1 real nem de rede).
 *   tsx scripts/nfse-nacional-poc.ts --offline
 *
 *   # 2) Envio real (produção restrita) com um A1 .pfx ICP-Brasil:
 *   PFX_PATH=cert.pfx PFX_PASS=senha tsx scripts/nfse-nacional-poc.ts --send
 *
 * Variáveis (envio): PFX_PATH, PFX_PASS, e opcionalmente EMIT_CNPJ, COD_MUN (IBGE 7 díg.),
 * CTRIB_NAC, NBS, VSERV, AMBIENTE (1=produção, 2=produção restrita/homologação — padrão 2).
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
const SEFIN_RESTRITA = "https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse";
const SEFIN_PRODUCAO = "https://sefin.nfse.gov.br/SefinNacional/nfse";

const onlyDigits = (s: string) => (s ?? "").replace(/\D/g, "");
const pad = (s: string | number, n: number) => String(s).replace(/\D/g, "").padStart(n, "0").slice(-n);

/** Id do infDPS = "DPS" + cMun(7) + tpInsc(1) + inscFed(14) + serie(5) + nDPS(15) = "DPS"+42 díg. */
function dpsId(p: { cMun: string; tpInsc: "1" | "2"; inscFed: string; serie: string; nDPS: string }): string {
  return `DPS${pad(p.cMun, 7)}${p.tpInsc}${pad(p.inscFed, 14)}${pad(p.serie, 5)}${pad(p.nDPS, 15)}`;
}

/** Monta um DPS de exemplo (estrutura representativa do leiaute nacional v1.00). */
function buildDpsXml(cfg: {
  cMun: string; cnpjEmit: string; im: string; serie: string; nDPS: string;
  cnpjToma: string; nomeToma: string; cTribNac: string; cNBS: string; vServ: string; xDescServ: string;
  tpAmb: "1" | "2";
}): { xml: string; id: string } {
  const id = dpsId({ cMun: cfg.cMun, tpInsc: "2", inscFed: cfg.cnpjEmit, serie: cfg.serie, nDPS: cfg.nDPS });
  // dhEmi no fuso -03:00 (Brasília). Subtrai 3h do UTC e rotula -03:00; -60s de folga p/ não cair
  // "no futuro" por skew de relógio (regra E0008).
  const local = new Date(Date.now() - 3 * 3600 * 1000 - 60 * 1000);
  const dhEmi = local.toISOString().replace(/\.\d{3}Z$/, "-03:00");
  const dCompet = dhEmi.slice(0, 10);
  // Estrutura mínima representativa (não necessariamente 100% schema-completa — o foco da PoC é
  // a assinatura + mTLS; campos de negócio se ajustam contra o retorno do validador).
  const xml =
    `<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">` +
      `<infDPS Id="${id}">` +
        `<tpAmb>${cfg.tpAmb}</tpAmb>` +
        `<dhEmi>${dhEmi}</dhEmi>` +
        `<verAplic>ERP-PoC-1.0</verAplic>` +
        `<serie>${cfg.serie}</serie>` +
        `<nDPS>${cfg.nDPS}</nDPS>` +
        `<dCompet>${dCompet}</dCompet>` +
        `<tpEmit>1</tpEmit>` +
        `<cLocEmi>${pad(cfg.cMun, 7)}</cLocEmi>` +
        `<prest><CNPJ>${onlyDigits(cfg.cnpjEmit)}</CNPJ><IM>${onlyDigits(cfg.im)}</IM><regTrib><opSimpNac>1</opSimpNac><regEspTrib>0</regEspTrib></regTrib></prest>` +
        `<toma><CNPJ>${onlyDigits(cfg.cnpjToma)}</CNPJ><xNome>${cfg.nomeToma}</xNome></toma>` +
        `<serv><locPrest><cLocPrestacao>${pad(cfg.cMun, 7)}</cLocPrestacao></locPrest>` +
          `<cServ><cTribNac>${cfg.cTribNac}</cTribNac><xDescServ>${cfg.xDescServ}</xDescServ></cServ></serv>` +
        `<valores><vServPrest><vServ>${cfg.vServ}</vServ></vServPrest>` +
          `<trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun>` +
          `<totTrib><vTotTrib><vTotTribFed>0.00</vTotTribFed><vTotTribEst>0.00</vTotTribEst><vTotTribMun>0.00</vTotTribMun></vTotTrib></totTrib></trib></valores>` +
      `</infDPS>` +
    `</DPS>`;
  return { xml, id };
}

/** Lê um A1 .pfx e devolve a chave privada e o certificado em PEM (para assinar). */
function pfxToPem(pfxPath: string, pass: string): { privateKeyPem: string; certPem: string } {
  const der = forge.util.createBuffer(readFileSync(pfxPath).toString("binary"));
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), pass);
  const keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]
    ?? p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
  if (!keyBag?.key || !certBag?.cert) throw new Error("PFX sem chave privada ou certificado.");
  return {
    privateKeyPem: forge.pki.privateKeyToPem(keyBag.key),
    certPem: forge.pki.certificateToPem(certBag.cert)
  };
}

/** Gera um par self-signed (apenas para validar a mecânica de assinatura offline). */
function selfSignedPem(): { privateKeyPem: string; certPem: string } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 86400000);
  const attrs = [{ name: "commonName", value: "POC NFSE NACIONAL:11222333000181" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey), certPem: forge.pki.certificateToPem(cert) };
}

/** Assina o DPS (XMLDSig enveloped, referência ao infDPS pelo Id, RSA-SHA256, C14N). */
function signDps(xml: string, privateKeyPem: string, certPem: string): string {
  const certB64 = certPem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
  const sig = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certPem,
    signatureAlgorithm: RSA_SHA256,
    canonicalizationAlgorithm: C14N,
    getKeyInfoContent: () => `<X509Data><X509Certificate>${certB64}</X509Certificate></X509Data>`
  });
  sig.addReference({
    xpath: "//*[local-name(.)='infDPS']",
    transforms: [ENVELOPED, C14N],
    digestAlgorithm: SHA256
  });
  // A assinatura entra como irmã do infDPS (enveloped), dentro de <DPS>.
  sig.computeSignature(xml, { location: { reference: "//*[local-name(.)='infDPS']", action: "after" } });
  return sig.getSignedXml();
}

function verifyLocal(signedXml: string, certPem: string): boolean {
  const sig = new SignedXml({ publicCert: certPem });
  const sigNode = /<(\w+:)?Signature[\s>][\s\S]*<\/(\w+:)?Signature>/.exec(signedXml)?.[0];
  if (!sigNode) return false;
  sig.loadSignature(sigNode);
  return sig.checkSignature(signedXml);
}

async function postSefin(dpsXmlGZipB64: string, pfxPath: string, pass: string, tpAmb: "1" | "2"): Promise<void> {
  const url = new URL(tpAmb === "1" ? SEFIN_PRODUCAO : SEFIN_RESTRITA);
  const body = JSON.stringify({ dpsXmlGZipB64 });
  await new Promise<void>((resolve, reject) => {
    const req = https.request(
      {
        method: "POST",
        hostname: url.hostname,
        path: url.pathname,
        pfx: readFileSync(pfxPath),
        passphrase: pass,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          console.log(`\n[SEFIN] HTTP ${res.statusCode}`);
          console.log(data.slice(0, 4000));
          resolve();
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const mode = process.argv.includes("--send") ? "send" : "offline";
  const tpAmb = (process.env.AMBIENTE === "1" ? "1" : "2") as "1" | "2";
  const cfg = {
    cMun: process.env.COD_MUN || "2919207", // Luís Eduardo Magalhães-BA (exemplo)
    cnpjEmit: process.env.EMIT_CNPJ || "11222333000181",
    im: process.env.EMIT_IM || "987654",
    serie: "900",
    nDPS: "1",
    cnpjToma: "11444777000161",
    nomeToma: "TOMADOR DE TESTE LTDA",
    cTribNac: process.env.CTRIB_NAC || "010101",
    cNBS: process.env.NBS || "115019000",
    vServ: process.env.VSERV || "100.00",
    xDescServ: "Servico de teste PoC NFSe Nacional",
    tpAmb
  };

  const { xml, id } = buildDpsXml(cfg);
  console.log(`infDPS Id: ${id} (len=${id.length})`);

  const { privateKeyPem, certPem } =
    mode === "send"
      ? pfxToPem(requireEnv("PFX_PATH"), requireEnv("PFX_PASS"))
      : selfSignedPem();

  const signed = signDps(xml, privateKeyPem, certPem);
  const okLocal = verifyLocal(signed, certPem);
  console.log(`Assinatura válida localmente: ${okLocal ? "SIM ✅" : "NÃO ❌"}`);
  console.log(`Reference: ${/<Reference[^>]*>/.exec(signed)?.[0] ?? "(não encontrado)"}`);
  console.log(`\n--- DPS assinado (início) ---\n${signed.slice(0, 1200)}\n...`);

  // A SEFIN exige o prólogo declarando UTF-8 (erro E1229 sem ele). Prepende-se após assinar —
  // não afeta a assinatura (a referência é ao elemento infDPS pelo Id, não ao documento inteiro).
  const signedComProlog = `<?xml version="1.0" encoding="UTF-8"?>${signed}`;
  const dpsXmlGZipB64 = gzipSync(Buffer.from(signedComProlog, "utf8")).toString("base64");
  console.log(`\nGZip+Base64: ${dpsXmlGZipB64.length} chars`);

  if (mode === "send") {
    await postSefin(dpsXmlGZipB64, requireEnv("PFX_PATH"), requireEnv("PFX_PASS"), tpAmb);
  } else {
    console.log("\n(Modo offline — para enviar de verdade: PFX_PATH=... PFX_PASS=... tsx scripts/nfse-nacional-poc.ts --send)");
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Defina a variável de ambiente ${name}.`);
  return v;
}

main().catch((e) => {
  console.error("ERRO:", e instanceof Error ? e.message : e);
  process.exit(1);
});

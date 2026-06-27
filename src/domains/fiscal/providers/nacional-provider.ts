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
import { buildDanfse, consultaPublicaNfseUrl } from "./nacional/danfse";
import type {
  CancelInput, CancelResult, CorrectionInput, CorrectionResult,
  EmitInput, EmitResult, FiscalProvider, ProviderContext, TestConnectionResult
} from "./types";

export { consultaPublicaNfseUrl };

const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";

const SEFIN: Record<AmbienteFiscal, string> = {
  PRODUCAO: "https://sefin.nfse.gov.br/SefinNacional",
  HOMOLOGACAO: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional"
};

// ADN (Ambiente de Dados Nacional): gera o DANFSE em PDF OFICIAL — GET /danfse/{chave} (mTLS).
// É infra distinta da SEFIN (a SEFIN /danfse devolve 501). Produção restrita = homologação.
const ADN: Record<AmbienteFiscal, string> = {
  PRODUCAO: "https://adn.nfse.gov.br",
  HOMOLOGACAO: "https://adn.producaorestrita.nfse.gov.br"
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

  // Tomador (opcional no nacional, mas mandamos quando há documento). Endereço é OBRIGATÓRIO
  // quando o ISS é retido pelo tomador (E0237) — então o incluímos sempre que houver.
  const dest = doc.destinatario;
  const docToma = onlyDigits(dest.documento);
  const endT = dest.endereco;
  const cepT = onlyDigits(endT?.cep);
  const tomaEnd =
    endT && (endT.codigoMunicipioIbge?.trim() || endT.logradouro?.trim() || cepT.length === 8)
      ? `<end><endNac><cMun>${onlyDigits(endT.codigoMunicipioIbge)}</cMun>${cepT.length === 8 ? `<CEP>${cepT}</CEP>` : ""}</endNac>` +
        `${endT.logradouro?.trim() ? `<xLgr>${esc(sanitizeTextoNfse(endT.logradouro))}</xLgr>` : ""}` +
        `${endT.numero?.trim() ? `<nro>${esc(sanitizeTextoNfse(endT.numero))}</nro>` : ""}` +
        `${endT.bairro?.trim() ? `<xBairro>${esc(sanitizeTextoNfse(endT.bairro))}</xBairro>` : ""}</end>`
      : "";
  const toma = docToma
    ? `<toma>${docToma.length === 14 ? `<CNPJ>${docToma}</CNPJ>` : `<CPF>${docToma}</CPF>`}<xNome>${esc(sanitizeTextoNfse(dest.nome))}</xNome>${tomaEnd}</toma>`
    : "";

  // regTrib.opSimpNac (tabela oficial): 1=Não optante (Lucro Presumido/Real) · 2=Optante MEI ·
  // 3=Optante ME/EPP (Simples Nacional). regEspTrib 0=nenhum.
  const opSimpNac =
    e.regime === "MEI" ? "2"
      : (e.regime === "SIMPLES_NACIONAL" || e.regime === "SIMPLES_EXCESSO_SUBLIMITE") ? "3"
      : "1";

  // SUBSTITUIÇÃO: quando o documento aponta uma NFS-e a substituir, emite-se a nova DPS com o grupo
  // <subst> (chave substituída + motivo). A SEFIN cancela a anterior por substituição e gera a nova.
  const sub = doc.substituicao;
  const chSubstda = onlyDigits(sub?.chaveSubstituida);
  const subst = chSubstda.length === 50
    ? `<subst><chSubstda>${chSubstda}</chSubstda><cMotivo>${pad(sub!.cMotivo || "99", 2)}</cMotivo>` +
      `${sub!.xMotivo ? `<xMotivo>${esc(sanitizeTextoNfse(sub!.xMotivo))}</xMotivo>` : ""}</subst>`
    : "";

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
      subst +
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

/** Assina (XMLDSig enveloped) o elemento `localName` referenciado pelo seu Id. Prologo UTF-8. */
function signInfoEl(xml: string, localName: string, privateKeyPem: string, certPem: string): string {
  const certB64 = certPem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
  const sig = new SignedXml({
    privateKey: privateKeyPem, publicCert: certPem,
    signatureAlgorithm: RSA_SHA256, canonicalizationAlgorithm: C14N,
    getKeyInfoContent: () => `<X509Data><X509Certificate>${certB64}</X509Certificate></X509Data>`
  });
  const xpath = `//*[local-name(.)='${localName}']`;
  sig.addReference({ xpath, transforms: [ENVELOPED, C14N], digestAlgorithm: SHA256 });
  sig.computeSignature(xml, { location: { reference: xpath, action: "after" } });
  return `<?xml version="1.0" encoding="UTF-8"?>${sig.getSignedXml()}`;
}

const signDps = (xml: string, privateKeyPem: string, certPem: string) => signInfoEl(xml, "infDPS", privateKeyPem, certPem);

/**
 * Monta o XML do evento de CANCELAMENTO (e101101) da NFS-e nacional. O autor (CNPJ/CPF) e o tipo de
 * inscrição saem da própria chave de acesso (cMun[7] + tpInsc[1] + inscFed[14] + ...). Id do
 * infPedReg (59 chars) = "PRE" + chNFSe(50) + tpEvento(6). nPedRegEvento foi removido do leiaute.
 */
function buildCancelEventoXml(chave: string, ambiente: AmbienteFiscal, justificativa: string): { xml: string } {
  const ch = onlyDigits(chave);
  // chNFSe: cMun(0-6) + tpAmbGerador[7] + tpInsc[8] + inscFed(9..). CPF=11, CNPJ=14 dígitos.
  const tpInsc = ch.charAt(8);
  const inscFed = ch.slice(9, tpInsc === "1" ? 20 : 23);
  const autor = tpInsc === "1" ? `<CPFAutor>${inscFed}</CPFAutor>` : `<CNPJAutor>${inscFed}</CNPJAutor>`;
  const id = `PRE${ch}101101`;
  const xMotivo = sanitizeTextoNfse(justificativa).slice(0, 255);
  const infPedReg =
    `<infPedReg Id="${id}">` +
      `<tpAmb>${ambiente === "PRODUCAO" ? "1" : "2"}</tpAmb>` +
      `<verAplic>ERP-1.0</verAplic>` +
      `<dhEvento>${dhEmiBrasilia()}</dhEvento>` +
      autor +
      `<chNFSe>${ch}</chNFSe>` +
      `<e101101><xDesc>Cancelamento de NFS-e</xDesc><cMotivo>1</cMotivo><xMotivo>${esc(xMotivo)}</xMotivo></e101101>` +
    `</infPedReg>`;
  return { xml: `<pedRegEvento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">${infPedReg}</pedRegEvento>` };
}

/** POST do pedido de registro de evento (cancelamento) — body { pedidoRegistroEventoXmlGZipB64 }. */
function postEventoNfse(baseUrl: string, chave: string, eventoGZipB64: string, cert: { pfx: Buffer; senha: string }): Promise<SefinResp> {
  const url = new URL(`${baseUrl}/nfse/${onlyDigits(chave)}/eventos`);
  const payload = JSON.stringify({ pedidoRegistroEventoXmlGZipB64: eventoGZipB64 });
  return new Promise((resolve, reject) => {
    const req = https.request(
      { method: "POST", hostname: url.hostname, path: url.pathname, pfx: cert.pfx, passphrase: cert.senha,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } },
      (res) => { let data = ""; res.on("data", (c) => (data += c)); res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: data })); }
    );
    req.on("error", reject);
    req.write(payload); req.end();
  });
}

type SefinResp = { statusCode: number; body: string };

/** GET autenticado por mTLS na SEFIN (consulta da NFS-e / XML autorizado). */
function getSefin(baseUrl: string, path: string, cert: { pfx: Buffer; senha: string }): Promise<SefinResp> {
  const url = new URL(`${baseUrl}${path}`);
  return new Promise((resolve, reject) => {
    const req = https.request(
      { method: "GET", hostname: url.hostname, path: url.pathname, pfx: cert.pfx, passphrase: cert.senha },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

/** HEAD /dps/{id}: 200 = já existe NFS-e p/ esse DPS (número usado); 404 = livre. */
function headDps(baseUrl: string, idDps: string, cert: { pfx: Buffer; senha: string }): Promise<boolean> {
  const url = new URL(`${baseUrl}/dps/${idDps}`);
  return new Promise((resolve) => {
    const req = https.request(
      { method: "HEAD", hostname: url.hostname, path: url.pathname, pfx: cert.pfx, passphrase: cert.senha },
      (res) => { res.resume(); resolve((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300); }
    );
    req.on("error", () => resolve(false)); // erro de rede → não bloqueia a emissão (a SEFIN ainda valida)
    req.end();
  });
}

/** GET binário por mTLS (ex.: DANFSE PDF do ADN). Acumula em Buffer — não corrompe o PDF. */
function getBinary(baseUrl: string, path: string, cert: { pfx: Buffer; senha: string }): Promise<{ statusCode: number; contentType: string; body: Buffer }> {
  const url = new URL(`${baseUrl}${path}`);
  return new Promise((resolve, reject) => {
    const req = https.request(
      { method: "GET", hostname: url.hostname, path: url.pathname, pfx: cert.pfx, passphrase: cert.senha, headers: { Accept: "application/pdf" } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, contentType: String(res.headers["content-type"] ?? ""), body: Buffer.concat(chunks) }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

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
    // Numeração: confirma com a SEFIN um nDPS livre (HEAD /dps) e pula os já usados — evita o E0014
    // (duplicidade de série+número) quando a sequência local não acompanha o que a SEFIN já registrou.
    const numero = await this.resolveNumeroLivre(input, ctx);
    const emitInput = numero === input.numero ? input : { ...input, numero };

    const { xml } = buildDpsXml(emitInput, ctx);
    const { privateKeyPem, certPem } = pfxToPem(ctx.certificado.pfx, ctx.certificado.senha);
    const signed = signDps(xml, privateKeyPem, certPem);
    const dpsXmlGZipB64 = gzipSync(Buffer.from(signed, "utf8")).toString("base64");

    const res = await postSefinNfse(SEFIN[ctx.ambiente], dpsXmlGZipB64, ctx.certificado);
    let data: { chaveAcesso?: string; nfseXmlGZipB64?: string; idDps?: string; erros?: Array<{ Codigo?: string; Descricao?: string; Complemento?: string }> } = {};
    try { data = JSON.parse(res.body); } catch { /* corpo não-JSON */ }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      const chave = data.chaveAcesso || chaveFromNfseB64(data.nfseXmlGZipB64);
      return { status: "AUTORIZADA", chaveAcesso: chave, providerRef: chave, xml: data.nfseXmlGZipB64, ...(numero !== input.numero ? { numero: String(numero) } : {}) };
    }
    const motivo = (data.erros ?? []).map((x) => `${x.Codigo ?? ""} ${x.Descricao ?? ""}${x.Complemento ? ` (${x.Complemento})` : ""}`.trim()).join("; ")
      || `Falha na SEFIN (HTTP ${res.statusCode}).`;
    return { status: res.statusCode === 422 || res.statusCode === 400 ? "REJEITADA" : "ERRO", motivo };
  }

  /**
   * Acha o próximo nDPS LIVRE na SEFIN a partir do número candidato (sequência local), consultando
   * HEAD /dps/{idDps}. Pula os números já usados (de emissões anteriores via ACBr/manual na mesma
   * série) para não cair em E0014. Limite de 30 tentativas; em erro de rede, devolve o candidato
   * (a própria SEFIN ainda valida na emissão).
   */
  private async resolveNumeroLivre(input: EmitInput, ctx: ProviderContext): Promise<number> {
    if (!ctx.certificado?.pfx) return input.numero;
    const cert = { pfx: ctx.certificado.pfx, senha: ctx.certificado.senha };
    const cMun = pad(input.emitter.codigoMunicipioIbge ?? "", 7);
    const cnpj = onlyDigits(input.emitter.cnpj);
    const serie = input.document.serie?.trim() || "1";
    let n = input.numero;
    for (let i = 0; i < 30; i++) {
      const usado = await headDps(SEFIN[ctx.ambiente], dpsId(cMun, cnpj, serie, String(n)), cert);
      if (!usado) return n;
      n++;
    }
    return n;
  }

  /**
   * Download dos documentos da NFS-e nacional (mTLS com o A1):
   *  - "pdf": baixa o **DANFSE PDF OFICIAL** do ADN (`GET /danfse/{chave}`, infra nacional, layout
   *    padrão — o mesmo que os integradores usam). Se o ADN falhar, FAZ FALLBACK gerando o DANFSE a
   *    partir do XML autorizado (buildDanfse → HTML printable).
   *  - "xml": serve o XML autorizado da NFS-e (SEFIN `GET /nfse/{chave}` → nfseXmlGZipB64 → gunzip).
   * (A SEFIN não gera o PDF — `GET /SefinNacional/danfse` devolve 501; o PDF é só no ADN.)
   */
  async downloadDocument(
    kind: "pdf" | "xml",
    ref: { providerRef: string; modelo: import("@prisma/client").ModeloFiscal },
    ctx: ProviderContext
  ): Promise<{ ok: boolean; contentType: string; body: Buffer; filename: string; error?: string }> {
    const fail = (error: string) => ({ ok: false, contentType: "", body: Buffer.alloc(0), filename: "", error });
    const chave = onlyDigits(ref.providerRef);
    if (!ctx.certificado?.pfx) {
      return fail("Certificado A1 não disponível para consultar a NFS-e nacional.");
    }
    const cert = { pfx: ctx.certificado.pfx, senha: ctx.certificado.senha };

    if (kind === "pdf") {
      // 1) DANFSE PDF oficial do ADN.
      try {
        const pdf = await getBinary(ADN[ctx.ambiente], `/danfse/${chave}`, cert);
        if (pdf.statusCode >= 200 && pdf.statusCode < 300 && pdf.body.subarray(0, 4).toString("latin1") === "%PDF") {
          return { ok: true, contentType: "application/pdf", body: pdf.body, filename: `NFSE-${chave}.pdf` };
        }
      } catch { /* cai no fallback */ }
      // 2) Fallback: gera o DANFSE a partir do XML autorizado (HTML printable).
      const xml = await this.fetchNfseXml(chave, cert, ctx.ambiente);
      if (!xml) return fail("Não foi possível obter o DANFSE no ADN nem o XML na SEFIN.");
      return { ok: true, ...buildDanfse(xml, { logoDataUrl: ctx.logoDataUrl }) };
    }

    const xml = await this.fetchNfseXml(chave, cert, ctx.ambiente);
    if (!xml) return fail("Não foi possível obter o XML da NFS-e na SEFIN.");
    return { ok: true, contentType: "application/xml", body: Buffer.from(xml, "utf8"), filename: `NFSE-${chave}.xml` };
  }

  /** Busca o XML autorizado da NFS-e na SEFIN (GET /nfse/{chave} → nfseXmlGZipB64 → gunzip). */
  private async fetchNfseXml(chave: string, cert: { pfx: Buffer; senha: string }, ambiente: AmbienteFiscal): Promise<string | null> {
    const res = await getSefin(SEFIN[ambiente], `/nfse/${chave}`, cert);
    if (res.statusCode < 200 || res.statusCode >= 300) return null;
    let data: { nfseXmlGZipB64?: string } = {};
    try { data = JSON.parse(res.body); } catch { return null; }
    if (!data.nfseXmlGZipB64) return null;
    return gunzipSync(Buffer.from(data.nfseXmlGZipB64, "base64")).toString("utf8");
  }

  /**
   * Cancelamento da NFS-e nacional — evento e101101 (POST /nfse/{chave}/eventos, mTLS + assinatura
   * do infPedReg). A chave de acesso vem em providerRef. Sucesso (2xx) → AUTORIZADO.
   */
  async cancel(input: CancelInput, ctx: ProviderContext): Promise<CancelResult> {
    if (!ctx.certificado?.pfx) {
      return { status: "ERRO", motivo: "Certificado A1 não disponível para assinar/transmitir o cancelamento da NFS-e." };
    }
    const chave = onlyDigits(input.chaveAcesso || input.providerRef || "");
    if (chave.length !== 50) {
      return { status: "ERRO", motivo: "Chave de acesso da NFS-e ausente/inválida (50 dígitos) — necessária para cancelar." };
    }
    if ((input.justificativa ?? "").trim().length < 15) {
      return { status: "REJEITADO", motivo: "A justificativa de cancelamento deve ter ao menos 15 caracteres." };
    }
    try {
      const { xml } = buildCancelEventoXml(chave, ctx.ambiente, input.justificativa);
      const { privateKeyPem, certPem } = pfxToPem(ctx.certificado.pfx, ctx.certificado.senha);
      const signed = signInfoEl(xml, "infPedReg", privateKeyPem, certPem);
      const gzipB64 = gzipSync(Buffer.from(signed, "utf8")).toString("base64");
      const res = await postEventoNfse(SEFIN[ctx.ambiente], chave, gzipB64, ctx.certificado);

      let data: { eventoXmlGZipB64?: string; erro?: Array<{ codigo?: string; descricao?: string; complemento?: string }> } = {};
      try { data = JSON.parse(res.body); } catch { /* corpo não-JSON */ }

      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Protocolo: nProt do evento autorizado (quando presente no XML do evento retornado).
        const evtXml = data.eventoXmlGZipB64 ? gunzipSync(Buffer.from(data.eventoXmlGZipB64, "base64")).toString("utf8") : "";
        const nProt = /<nProt>(\d+)<\/nProt>/.exec(evtXml)?.[1];
        return { status: "AUTORIZADO", protocolo: nProt };
      }
      const motivo = (data.erro ?? []).map((x) => `${x.codigo ?? ""} ${x.descricao ?? ""}${x.complemento ? ` (${x.complemento})` : ""}`.trim()).join("; ")
        || `Falha no cancelamento na SEFIN (HTTP ${res.statusCode}).`;
      return { status: res.statusCode === 400 || res.statusCode === 422 ? "REJEITADO" : "ERRO", motivo };
    } catch (e) {
      return { status: "ERRO", motivo: `Falha ao cancelar a NFS-e: ${e instanceof Error ? e.message : String(e)}` };
    }
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

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
import { pfxToPem, pfxTlsOptions } from "./pfx-utils";
import { SignedXml } from "xml-crypto";
import type { AmbienteFiscal, ProvedorFiscal } from "@prisma/client";
import { cTribNacFromCodigo, exigeGrupoObra } from "@/domains/fiscal/codigo-tributacao-nacional";
import { buildDanfse, consultaPublicaNfseUrl } from "./nacional/danfse";
import type {
  CancelInput, CancelResult, CorrectionInput, CorrectionResult,
  EmitInput, EmitResult, FiscalProvider, ProviderContext, TestConnectionResult
} from "./types";
import { normalizeDocumento } from "@/lib/fiscal/documento";
import { normalizeDfeKey } from "./sefaz/chave";
import { CENTI_MUNICIPIOS, buildCentiGerarXml, signCentiXml, buildCentiCancelarXml, signCentiCancelamento, centiApiCall, parseCentiRetorno } from "./centi/rps-builder";

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
  const cnpjEmit = normalizeDocumento(e.cnpj);
  const serieBruta = doc.serie?.trim() || "1";
  // ISSnet-DF: XSD exige série com zeros à esquerda (5 díg.); a SEFIN aceita sem pad.
  const serie = String(input.emitter.codigoMunicipioIbge ?? "") === "5300108" ? serieBruta.padStart(5, "0") : serieBruta;
  const nDPS = String(input.numero);
  const id = dpsId(cMun, cnpjEmit, serie, nDPS);
  const tpAmb = ctx.ambiente === "PRODUCAO" ? "1" : "2";

  // Serviço (1 grupo cServ — o nacional é um serviço por DPS).
  const servItem = doc.itens.find((i) => i.servico) ?? doc.itens[0];
  const cTribNac = cTribNacFromCodigo(servItem?.itemListaServico);
  const cNBS = onlyDigits(servItem?.codigoNbs);
  const xDescServ = sanitizeTextoNfse(doc.itens.map((i) => i.descricao).join("; ") || doc.naturezaOperacao) || "Servico";
  const vServ = fmt(input.totals.valorServicos || input.total);

  // Grupo OBRA (construção civil): obrigatório no DPS quando o cTribNac exige (E0370 — subitens
  // 07.02.x, 07.04/05/06/07/08, 07.17, 07.19, 14.14.03/04). TCInfoObra é xs:choice: informa-se
  // EXATAMENTE UM identificador — CNO (cObra) OU inscrição imobiliária OU o endereço da obra
  // (TCEnderecoSimples: CEP + logradouro/nº/bairro). Prioriza CNO > inscrição > endereço. Vai
  // dentro de <serv>, após <cServ>.
  const obraInfo = doc.obra;
  let obra = "";
  if (obraInfo && exigeGrupoObra(servItem?.itemListaServico)) {
    const cObra = onlyDigits(obraInfo.cObra);
    const inscImob = (obraInfo.inscricaoImobiliaria ?? "").trim();
    const eo = obraInfo.endereco;
    const cepO = onlyDigits(eo?.cep);
    let conteudoObra = "";
    if (cObra) {
      conteudoObra = `<cObra>${cObra}</cObra>`;
    } else if (inscImob) {
      conteudoObra = `<inscImobFisc>${esc(inscImob)}</inscImobFisc>`;
    } else if (eo && cepO.length === 8 && eo.logradouro?.trim() && eo.numero?.trim() && eo.bairro?.trim()) {
      conteudoObra =
        `<end><CEP>${cepO}</CEP>` +
        `<xLgr>${esc(sanitizeTextoNfse(eo.logradouro))}</xLgr>` +
        `<nro>${esc(sanitizeTextoNfse(eo.numero))}</nro>` +
        `${eo.complemento?.trim() ? `<xCpl>${esc(sanitizeTextoNfse(eo.complemento))}</xCpl>` : ""}` +
        `<xBairro>${esc(sanitizeTextoNfse(eo.bairro))}</xBairro></end>`;
    }
    if (conteudoObra) obra = `<obra>${conteudoObra}</obra>`;
  }

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
  const docToma = normalizeDocumento(dest.documento);
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
  const chSubstda = normalizeDfeKey(sub?.chaveSubstituida);
  const substituindo = chSubstda.length === 50;
  const subst = substituindo
    ? `<subst><chSubstda>${chSubstda}</chSubstda><cMotivo>${pad(sub!.cMotivo || "99", 2)}</cMotivo>` +
      `${sub!.xMotivo ? `<xMotivo>${esc(sanitizeTextoNfse(sub!.xMotivo))}</xMotivo>` : ""}</subst>`
    : "";

  // Campos IMUTÁVEIS na substituição (E0060): quando a SEFIN cancela a original e emite a substituta,
  // estes têm de ser IDÊNTICOS aos da NFS-e original. Reusa os valores extraídos dela (quando existirem);
  // senão mantém o cálculo normal (emissão nova). A data de competência é a causa mais comum (a original
  // foi de outra data e a substituta não pode usar "hoje").
  const dCompet = substituindo && sub?.dCompetOriginal && /^\d{4}-\d{2}-\d{2}$/.test(sub.dCompetOriginal)
    ? sub.dCompetOriginal
    : dhEmiBrasilia().slice(0, 10);
  const cTribNacFinal = substituindo && sub?.cTribNacOriginal ? sub.cTribNacOriginal : cTribNac;
  const cLocPrestacao = substituindo && onlyDigits(sub?.cLocPrestacaoOriginal).length >= 7
    ? onlyDigits(sub!.cLocPrestacaoOriginal)
    : cMun;
  const noDf = String(input.emitter.codigoMunicipioIbge ?? "") === "5300108";
  const cTribMun = substituindo
    ? onlyDigits(sub?.cTribMunOriginal)
    : noDf
      // DF (ISSnet): cTribMun é 1-1 no XSD. Sem código municipal específico no cadastro,
      // usa o próprio cTribNac (6 díg.) — revisar com a tabela CTISS do DF no 1º piloto.
      ? "" // preenchido abaixo com cTribNacFinal (declarado depois deste ponto)
      : "";

  const infDPS =
    `<infDPS Id="${id}">` +
      `<tpAmb>${tpAmb}</tpAmb>` +
      `<dhEmi>${dhEmiBrasilia()}</dhEmi>` +
      `<verAplic>ERP-1.0</verAplic>` +
      `<serie>${esc(serie)}</serie>` +
      `<nDPS>${esc(nDPS)}</nDPS>` +
      `<dCompet>${dCompet}</dCompet>` +
      `<tpEmit>1</tpEmit>` +
      `<cLocEmi>${cMun}</cLocEmi>` +
      subst +
      `<prest><CNPJ>${cnpjEmit}</CNPJ>${e.inscricaoMunicipal ? `<IM>${onlyDigits(e.inscricaoMunicipal)}</IM>` : ""}` +
        `<regTrib><opSimpNac>${opSimpNac}</opSimpNac><regEspTrib>0</regEspTrib></regTrib></prest>` +
      toma +
      `<serv><locPrest><cLocPrestacao>${cLocPrestacao}</cLocPrestacao></locPrest>` +
        `<cServ><cTribNac>${cTribNacFinal}</cTribNac>${cTribMun ? `<cTribMun>${cTribMun}</cTribMun>` : noDf ? `<cTribMun>${cTribNacFinal}</cTribMun>` : ""}<xDescServ>${esc(xDescServ)}</xDescServ>${cNBS.length === 9 ? `<cNBS>${cNBS}</cNBS>` : ""}</cServ>${obra}</serv>` +
      `<valores><vServPrest><vServ>${vServ}</vServ></vServPrest>` +
        `<trib><tribMun><tribISSQN>${doc.tribIssqnCodigo ?? "1"}</tribISSQN><tpRetISSQN>${issRetido ? "2" : "1"}</tpRetISSQN></tribMun>` +
        tribFed +
        `<totTrib><vTotTrib><vTotTribFed>${vTotFed}</vTotTribFed><vTotTribEst>0.00</vTotTribEst><vTotTribMun>${vISSQN}</vTotTribMun></vTotTrib></totTrib>` +
        `</trib></valores>` +
    `</infDPS>`;
  return { xml: `<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">${infDPS}</DPS>`, id };
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
  const ch = normalizeDfeKey(chave);
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
  const url = new URL(`${baseUrl}/nfse/${normalizeDfeKey(chave)}/eventos`);
  const payload = JSON.stringify({ pedidoRegistroEventoXmlGZipB64: eventoGZipB64 });
  return new Promise((resolve, reject) => {
    const req = https.request(
      { method: "POST", hostname: url.hostname, path: url.pathname, ...pfxTlsOptions(cert),
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
      { method: "GET", hostname: url.hostname, path: url.pathname, ...pfxTlsOptions(cert) },
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
      { method: "HEAD", hostname: url.hostname, path: url.pathname, ...pfxTlsOptions(cert) },
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
      { method: "GET", hostname: url.hostname, path: url.pathname, ...pfxTlsOptions(cert), headers: { Accept: "application/pdf" } },
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
        ...pfxTlsOptions(cert),
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

/** Extrai chave (chNFSe, 50 díg.) e número oficial (nNFSe) da NFS-e retornada (XML GZip+Base64). */
function parseNfseRetorno(nfseXmlGZipB64: string | undefined): { chave?: string; nNFSe?: string } {
  if (!nfseXmlGZipB64) return {};
  try {
    const xml = gunzipSync(Buffer.from(nfseXmlGZipB64, "base64")).toString("utf8");
    const chave = /Id="NFS([A-Z0-9]{50})"/i.exec(xml)?.[1] ?? /<chNFSe>([A-Z0-9]{50})<\/chNFSe>/i.exec(xml)?.[1];
    const nNFSe = /<nNFSe>(\d+)<\/nNFSe>/.exec(xml)?.[1];
    return { chave, nNFSe };
  } catch {
    return {};
  }
}

/** Extrai a chave de acesso (chNFSe, 50 díg.) da NFS-e retornada (XML GZip+Base64 ou chave direta). */
function chaveFromNfseB64(nfseXmlGZipB64: string | undefined): string | undefined {
  if (!nfseXmlGZipB64) return undefined;
  try {
    const xml = gunzipSync(Buffer.from(nfseXmlGZipB64, "base64")).toString("utf8");
    return /Id="NFS([A-Z0-9]{50})"/i.exec(xml)?.[1] ?? /<chNFSe>([A-Z0-9]{50})<\/chNFSe>/i.exec(xml)?.[1];
  } catch {
    return undefined;
  }
}

/** Devolve o XML da NFS-e salvo (aceita XML puro OU GZip+Base64, como fica em NotaFiscal.xml). */
function unwrapNfseXml(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("<")) return t;
  try { return gunzipSync(Buffer.from(t, "base64")).toString("utf8"); } catch { return t; }
}

/**
 * Extrai da NFS-e ORIGINAL os campos que a SEFIN NÃO deixa alterar na substituição (E0060):
 * data de competência, subitem da lista (cTribNac), local da prestação (cLocPrestacao/cLocIncid) e
 * código complementar municipal (cTribMun). A substituta deve repeti-los idênticos. Aceita o valor
 * bruto de NotaFiscal.xml (GZip+Base64 no provedor nacional). Campo ausente → null (o provider
 * recalcula, mantendo o comportamento antigo).
 */
export function extrairCamposImutaveisSubstituicao(notaXmlRaw: string): {
  dCompet: string | null; cTribNac: string | null; cLocPrestacao: string | null; cTribMun: string | null;
} {
  const xml = unwrapNfseXml(notaXmlRaw);
  const pick = (tag: string): string | null => {
    const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}>\\s*([^<]+?)\\s*</(?:\\w+:)?${tag}>`));
    return m ? m[1].trim() : null;
  };
  return {
    dCompet: pick("dCompet"),
    cTribNac: pick("cTribNac"),
    // No DPS o local vem em cLocPrestacao; no infNFSe processado pode aparecer como cLocIncid.
    cLocPrestacao: pick("cLocPrestacao") ?? pick("cLocIncid"),
    cTribMun: pick("cTribMun")
  };
}

// ─── ISSnet-DF (Brasília) ─────────────────────────────────────────────────────
// O DF NÃO usa a SEFIN: emissor próprio (ISSnet) com o MESMO DPS nacional via SOAP.
// Contrato validado em HOM (2026-08-05): params nfseCabecMsg/nfseDadosMsg com XML
// CRU inline (escapar/CDATA => E183/E160 falsos); resposta ListaMensagemRetorno.
const ISSNET_DF_MUN = "5300108";
const ISSNET_DF = {
  PRODUCAO: { host: "nfse.fazenda.df.gov.br", path: "/wsnfsenacional/nfse.asmx" },
  HOMOLOGACAO: { host: "nfse.issnetonline.com.br", path: "/wsnfsenacional/homologacao/nfse.asmx" }
} as const;
const NFSE_NS = "http://www.sped.fazenda.gov.br/nfse";

function issnetSoapCall(
  operacao: string,
  dadosXml: string,
  ambiente: "PRODUCAO" | "HOMOLOGACAO",
  certificado: { pfx: Buffer; senha: string },
  versaoDados = "1.00"
): Promise<{ statusCode: number; body: string }> {
  const alvo = ISSNET_DF[ambiente];
  const cabec = `<cabecalho versao="${versaoDados}" xmlns="${NFSE_NS}"><versaoDados>${versaoDados}</versaoDados></cabecalho>`;
  const body =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body><${operacao} xmlns="${NFSE_NS}">` +
    `<nfseCabecMsg>${cabec}</nfseCabecMsg>` +
    `<nfseDadosMsg>${dadosXml}</nfseDadosMsg>` +
    `</${operacao}></soap:Body></soap:Envelope>`;
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: alvo.host, path: alvo.path, method: "POST",
        ...pfxTlsOptions(certificado),
        rejectUnauthorized: false, timeout: 60000,
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: `${NFSE_NS}/${operacao}`,
          "User-Agent": "Mozilla/5.0",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: d }));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout no webservice do ISSnet-DF.")); });
    req.write(body);
    req.end();
  });
}

function issnetErros(body: string): Array<{ codigo: string; mensagem: string }> {
  const plain = body.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  return [...plain.matchAll(/<Codigo>([^<]+)<\/Codigo>\s*<Mensagem>([^<]+)<\/Mensagem>/g)]
    .map((m) => ({ codigo: m[1], mensagem: m[2] }));
}

export class NacionalFiscalProvider implements FiscalProvider {
  readonly id: ProvedorFiscal = "NACIONAL" as ProvedorFiscal;

  /** Emissão via CENTI (REST ABRASF). Exige credenciais do portal municipal no cadastro fiscal. */
  private async emitViaCenti(input: EmitInput, ctx: ProviderContext): Promise<EmitResult> {
    const municipio = CENTI_MUNICIPIOS[String(input.emitter.codigoMunicipioIbge ?? "")];
    if (!ctx.nfsePortal?.usuario || !ctx.nfsePortal.senha) {
      return { status: "ERRO", motivo: "Informe usuário e senha do portal municipal de NFS-e (Configurações → Fiscal) para emitir neste município." };
    }
    const { xml } = buildCentiGerarXml(input);
    const { privateKeyPem, certPem } = pfxToPem(ctx.certificado!.pfx, ctx.certificado!.senha);
    const assinado = signCentiXml(xml, privateKeyPem, certPem);
    const res = await centiApiCall({
      operacao: "gerar", municipio,
      usuario: ctx.nfsePortal.usuario, senha: ctx.nfsePortal.senha,
      xmlAssinado: assinado
    });
    const ret = parseCentiRetorno(res.body);
    if (ret.erros.length) {
      return {
        status: "REJEITADA",
        motivo: ret.erros.map((e) => `${e.codigo}: ${e.mensagem}`).join(" | ").slice(0, 900),
        numero: String(input.numero)
      } as EmitResult;
    }
    if (res.status < 200 || res.status >= 300 || !ret.numeroNfse) {
      return { status: "ERRO", motivo: `CENTI: resposta inesperada (HTTP ${res.status}) — ${res.body.slice(0, 200)}`, numero: String(input.numero) } as EmitResult;
    }
    return {
      status: "AUTORIZADA",
      chave: ret.chaveNacional ?? ret.codigoVerificacao ?? ret.numeroNfse,
      numero: String(input.numero),
      numeroNfse: ret.numeroNfse,
      xml: ret.xmlNota ?? assinado,
      motivo: null
    } as unknown as EmitResult;
  }

  /** Cancelamento via CENTI (Pedido ABRASF assinado). */
  private async cancelViaCenti(nota: { chave: string; municipioIbge: string; cnpj: string; im: string | null; numeroNfse: string }, ctx: ProviderContext): Promise<CancelResult> {
    const municipio = CENTI_MUNICIPIOS[nota.municipioIbge];
    if (!ctx.nfsePortal?.usuario || !ctx.nfsePortal.senha) {
      return { status: "ERRO", motivo: "Credenciais do portal municipal ausentes para cancelar no CENTI." };
    }
    const { xml } = buildCentiCancelarXml({
      chaveOuNumeroNfse: nota.numeroNfse || nota.chave,
      cnpjPrestador: nota.cnpj,
      inscricaoMunicipal: nota.im,
      codigoMunicipioIbge: nota.municipioIbge
    });
    const { privateKeyPem, certPem } = pfxToPem(ctx.certificado!.pfx, ctx.certificado!.senha);
    const assinado = signCentiCancelamento(xml, privateKeyPem, certPem);
    const res = await centiApiCall({
      operacao: "cancelar", municipio,
      usuario: ctx.nfsePortal.usuario, senha: ctx.nfsePortal.senha,
      xmlAssinado: assinado
    });
    const ret = parseCentiRetorno(res.body);
    const errosReais = ret.erros.filter((e) => !/cancelad/i.test(e.mensagem));
    if (ret.erros.length && errosReais.length === ret.erros.length && ret.erros.length > 0) {
      const ja = ret.erros.some((e) => /cancelad/i.test(e.mensagem));
      if (!ja) return { status: "REJEITADO", motivo: ret.erros.map((e) => `${e.codigo}: ${e.mensagem}`).join(" | ").slice(0, 900) };
    }
    if (res.status < 200 || res.status >= 300) {
      return { status: "ERRO", motivo: `CENTI: HTTP ${res.status} no cancelamento.` };
    }
    return { status: "AUTORIZADO", motivo: null } as unknown as CancelResult;
  }

  /** Emissão via ISSnet-DF (GerarNfse síncrono). DPS idêntico ao da SEFIN. */
  private async emitViaIssnetDf(signedDps: string, input: EmitInput, ctx: ProviderContext): Promise<EmitResult> {
    const corpo = signedDps.replace(/^<\?xml[^>]*\?>/, "");
    const dados = `<GerarNfseEnvio xmlns="${NFSE_NS}">${corpo}</GerarNfseEnvio>`;
    const res = await issnetSoapCall("GerarNfse", dados, ctx.ambiente, ctx.certificado!);
    const erros = issnetErros(res.body);
    if (erros.length) {
      return {
        status: "REJEITADA",
        motivo: erros.map((e) => `${e.codigo}: ${e.mensagem}`).join(" | ").slice(0, 900),
        numero: String(input.numero)
      } as EmitResult;
    }
    const plain = res.body.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const chave = /Id="NFS([A-Za-z0-9]{50})"/.exec(plain)?.[1] ?? /<ChaveAcesso>([A-Za-z0-9]{44,50})<\/ChaveAcesso>/.exec(plain)?.[1];
    const nNfse = /<nNFSe>(\d+)<\/nNFSe>/.exec(plain)?.[1];
    if (res.statusCode !== 200 || !chave) {
      return { status: "ERRO", motivo: `ISSnet-DF: resposta inesperada (HTTP ${res.statusCode}).`, numero: String(input.numero) } as EmitResult;
    }
    const infNfse = /<NFSe[\s\S]*?<\/NFSe>/.exec(plain)?.[0] ?? null;
    return {
      status: "AUTORIZADA",
      chave,
      numero: String(input.numero),
      numeroNfse: nNfse ?? undefined,
      xml: infNfse ?? signedDps,
      motivo: null
    } as unknown as EmitResult;
  }

  async emit(input: EmitInput, ctx: ProviderContext): Promise<EmitResult> {
    if (input.document.modelo !== "NFSE") {
      return { status: "ERRO", motivo: "O provedor NACIONAL emite apenas NFS-e (NF-e/NFC-e seguem pelo ACBr)." };
    }
    if (!ctx.certificado?.pfx) {
      return { status: "ERRO", motivo: "Certificado A1 não disponível para assinar/transmitir a NFS-e nacional." };
    }
    // Numeração: confirma com a SEFIN um nDPS livre (HEAD /dps) e pula os já usados — evita o E0014
    // (duplicidade de série+número) quando a sequência local não acompanha o que a SEFIN já registrou.
    // Municípios CENTI (ex.: Posse-GO): leiaute ABRASF próprio + REST com login do portal.
    if (CENTI_MUNICIPIOS[String(input.emitter.codigoMunicipioIbge ?? "")]) {
      return this.emitViaCenti(input, ctx);
    }

    // No DF a numeração é conferida pelo próprio ISSnet (a SEFIN não conhece a série de lá).
    const numero = String(input.emitter.codigoMunicipioIbge ?? '') === ISSNET_DF_MUN
      ? input.numero
      : await this.resolveNumeroLivre(input, ctx);
    const emitInput = numero === input.numero ? input : { ...input, numero };

    const { xml } = buildDpsXml(emitInput, ctx);
    const { privateKeyPem, certPem } = pfxToPem(ctx.certificado.pfx, ctx.certificado.senha);
    const signed = signDps(xml, privateKeyPem, certPem);

    // Brasília: o DF não usa a SEFIN — mesmo DPS assinado, transporte SOAP do ISSnet.
    if (String(input.emitter.codigoMunicipioIbge ?? "") === ISSNET_DF_MUN) {
      return this.emitViaIssnetDf(signed, emitInput, ctx);
    }
    const dpsXmlGZipB64 = gzipSync(Buffer.from(signed, "utf8")).toString("base64");

    const res = await postSefinNfse(SEFIN[ctx.ambiente], dpsXmlGZipB64, ctx.certificado);
    let data: { chaveAcesso?: string; nfseXmlGZipB64?: string; idDps?: string; erros?: Array<{ Codigo?: string; Descricao?: string; Complemento?: string }> } = {};
    try { data = JSON.parse(res.body); } catch { /* corpo não-JSON */ }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      const parsed = parseNfseRetorno(data.nfseXmlGZipB64);
      const chave = data.chaveAcesso || parsed.chave;
      return {
        status: "AUTORIZADA", chaveAcesso: chave, providerRef: chave, xml: data.nfseXmlGZipB64,
        ...(parsed.nNFSe ? { numeroNfse: parsed.nNFSe } : {}),
        ...(numero !== input.numero ? { numero: String(numero) } : {})
      };
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
    const cnpj = normalizeDocumento(input.emitter.cnpj);
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
      // 1) DANFSE PDF oficial do ADN. O gateway do ADN às vezes responde 502/503/504 transitório
      // (e notas recém-emitidas levam alguns minutos para o DANFSE propagar) — tenta 3x antes do
      // fallback. Erro não-transitório (ex.: 404) vai direto pro fallback.
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        try {
          const pdf = await getBinary(ADN[ctx.ambiente], `/danfse/${chave}`, cert);
          if (pdf.statusCode >= 200 && pdf.statusCode < 300 && pdf.body.subarray(0, 4).toString("latin1") === "%PDF") {
            return { ok: true, contentType: "application/pdf", body: pdf.body, filename: `NFSE-${chave}.pdf` };
          }
          if (![502, 503, 504].includes(pdf.statusCode)) break; // 404/4xx → não adianta repetir
        } catch { /* erro de rede: tenta de novo */ }
        if (tentativa < 2) await new Promise((r) => setTimeout(r, 1200));
      }
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
    const chave = normalizeDfeKey(input.chaveAcesso || input.providerRef || "");
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

      // Nota de município CENTI (chave nacional começa no cMun): cancela pela API deles.
      const munCenti = Object.keys(CENTI_MUNICIPIOS).find((m) => chave.startsWith(m));
      if (munCenti) {
        // chNFSe: cMun(0-6) + amb[7] + tpInsc[8] + inscFed(9..22) + nNFSe(23..35).
        const cnpj = chave.slice(9, 23);
        const nNfse = chave.slice(23, 36).replace(/^0+/, "");
        return this.cancelViaCenti({ chave, municipioIbge: munCenti, cnpj, im: null, numeroNfse: nNfse }, ctx);
      }

      // Nota de Brasília (chave começa no cMun 5300108): cancela pelo ISSnet — mesmo
      // pedRegEvento e101101 assinado, embrulhado em CancelarNfseEnvio via SOAP.
      if (chave.startsWith(ISSNET_DF_MUN)) {
        const corpoEvt = signed.replace(/^<\?xml[^>]*\?>/, "");
        const dados = `<CancelarNfseEnvio xmlns="${NFSE_NS}">${corpoEvt}</CancelarNfseEnvio>`;
        const resDf = await issnetSoapCall("CancelarNfse", dados, ctx.ambiente, ctx.certificado);
        const errosDf = issnetErros(resDf.body).filter((e) => !/^A/.test(e.codigo)); // A* = alertas
        if (errosDf.length) {
          const ja = errosDf.some((e) => /cancelad/i.test(e.mensagem));
          if (ja) return { status: "AUTORIZADO", motivo: "NFS-e já constava cancelada no ISSnet-DF." };
          return { status: "REJEITADO", motivo: errosDf.map((e) => `${e.codigo}: ${e.mensagem}`).join(" | ").slice(0, 900) };
        }
        if (resDf.statusCode !== 200) {
          return { status: "ERRO", motivo: `ISSnet-DF: HTTP ${resDf.statusCode} no cancelamento.` };
        }
        return { status: "AUTORIZADO", motivo: null } as unknown as CancelResult;
      }

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
      // Idempotente: a SEFIN recusa um novo cancelamento quando a NFS-e JÁ está cancelada (ex.: cancelada
      // pelo portal nacional). Como a nota está de fato cancelada, tratamos como sucesso e sincronizamos.
      if (/cancelamento.*j[áa].*vinculad|j[áa].*(est[áa]\s*vinculad|cancelad)/i.test(motivo)) {
        return { status: "AUTORIZADO", motivo: "NFS-e já estava cancelada na SEFIN — status sincronizado." };
      }
      return { status: res.statusCode === 400 || res.statusCode === 422 ? "REJEITADO" : "ERRO", motivo };
    } catch (e) {
      return { status: "ERRO", motivo: `Falha ao cancelar a NFS-e: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  async correct(_input: CorrectionInput, _ctx: ProviderContext): Promise<CorrectionResult> {
    return { status: "ERRO", motivo: "NFS-e nacional não tem carta de correção — use substituição." };
  }
  /**
   * Consulta o estado real da NFS-e na SEFIN e detecta CANCELAMENTO — inclusive feito por fora do
   * sistema (ex.: pelo portal nacional). GET /nfse/{chave} confirma a existência; se houver um evento
   * de cancelamento (101101) vinculado, a nota está cancelada. Em caso de falha de consulta retorna
   * PROCESSANDO (o use-case não rebaixa o status atual).
   */
  async queryStatus(chaveAcesso: string, ctx: ProviderContext): Promise<EmitResult> {
    if (!ctx.certificado?.pfx) {
      return { status: "PROCESSANDO", motivo: "Certificado A1 não disponível para consultar a NFS-e nacional." };
    }
    const chave = normalizeDfeKey(chaveAcesso);
    if (chave.length !== 50) {
      return { status: "PROCESSANDO", motivo: "Chave da NFS-e ausente/inválida para consulta." };
    }
    const cert = { pfx: ctx.certificado.pfx, senha: ctx.certificado.senha };

    // Nota de Brasília: a SEFIN não conhece a chave (emissor é o ISSnet) — sem guard, o 404
    // da SEFIN marcaria a nota como REJEITADA indevidamente. Consulta própria fica p/ fase 3.
    if (chave.startsWith(ISSNET_DF_MUN)) {
      return { status: "PROCESSANDO", chaveAcesso: chave, motivo: "Consulta de situação no ISSnet-DF ainda não implementada — status mantido." } as EmitResult;
    }
    if (Object.keys(CENTI_MUNICIPIOS).some((m) => chave.startsWith(m))) {
      return { status: "PROCESSANDO", chaveAcesso: chave, motivo: "Consulta de situação no provedor municipal (CENTI) ainda não implementada — status mantido." } as EmitResult;
    }

    const nfse = await getSefin(SEFIN[ctx.ambiente], `/nfse/${chave}`, cert);
    if (nfse.statusCode === 404) {
      return { status: "REJEITADA", chaveAcesso: chave, motivo: "NFS-e não localizada na SEFIN." };
    }
    if (nfse.statusCode < 200 || nfse.statusCode >= 300) {
      return { status: "PROCESSANDO", chaveAcesso: chave, motivo: `Consulta à SEFIN falhou (HTTP ${nfse.statusCode}).` };
    }

    // Evento de CANCELAMENTO (101101) vinculado? Então a nota está cancelada (mesmo cancelamento externo).
    const evt = await getSefin(SEFIN[ctx.ambiente], `/nfse/${chave}/eventos/101101/1`, cert);
    if (evt.statusCode >= 200 && evt.statusCode < 300) {
      let protocolo: string | undefined;
      try {
        const d = JSON.parse(evt.body) as { eventoXmlGZipB64?: string };
        const evtXml = d.eventoXmlGZipB64 ? gunzipSync(Buffer.from(d.eventoXmlGZipB64, "base64")).toString("utf8") : "";
        protocolo = /<nProt>(\d+)<\/nProt>/.exec(evtXml)?.[1];
      } catch { /* corpo não-JSON */ }
      return { status: "CANCELADA", chaveAcesso: chave, protocolo };
    }

    return { status: "AUTORIZADA", chaveAcesso: chave };
  }
  async testConnection(_ctx: ProviderContext): Promise<TestConnectionResult> {
    return { ok: false, message: "Teste de conexão NFS-e nacional ainda não implementado (F4)." };
  }
}

/** Exporto o builder para o harness/teste da F1 validar o DPS contra a produção restrita. */
export { buildDpsXml, signDps, pfxToPem };

/** Baixa o XML autorizado da NFS-e nacional pela CHAVE (uso: clonagem de notas antigas do
 *  ACBr cujo xml não foi salvo no banco). mTLS com o A1 da empresa. */
export async function baixarNfseXmlPelaChave(
  chave: string,
  cert: { pfx: Buffer; senha: string },
  ambiente: AmbienteFiscal
): Promise<string | null> {
  const res = await getSefin(SEFIN[ambiente], `/nfse/${chave}`, cert);
  if (res.statusCode < 200 || res.statusCode >= 300) return null;
  let data: { nfseXmlGZipB64?: string } = {};
  try { data = JSON.parse(res.body); } catch { return null; }
  if (!data.nfseXmlGZipB64) return null;
  return gunzipSync(Buffer.from(data.nfseXmlGZipB64, "base64")).toString("utf8");
}

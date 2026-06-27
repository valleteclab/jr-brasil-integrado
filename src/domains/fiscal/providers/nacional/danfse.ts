/**
 * DANFSE (Documento Auxiliar da NFS-e) — representação gráfica da NFS-e do Sistema Nacional.
 *
 * Gera o DANFSE a partir do XML `<NFSe>` AUTORIZADO (devolvido pela SEFIN em GET /nfse/{chave}).
 * A SEFIN NÃO gera PDF (GET /danfse → 501): o documento é responsabilidade do emitente. Em vez de
 * mandar o usuário ao portal público, montamos aqui um DANFSE em HTML autocontido (CSS A4 para
 * impressão) + QR Code de consulta, e o usuário salva como PDF pelo próprio navegador
 * ("Imprimir → Salvar como PDF") — mesma abordagem do DANFE da NF-e (sem Chromium no servidor).
 *
 * O XML tem dois grupos relevantes: `infNFSe` (dados consolidados pela SEFIN: número nNFSe, emit,
 * valores finais) e o `DPS/infDPS` que enviamos (tomador, serviço, tributos). Parsing por regex no
 * mesmo espírito de soap.ts/danfe.ts.
 */
import { qrCodeSvg } from "../_shared/qrcode-svg";

const onlyDigits = (s: string | number | null | undefined) => String(s ?? "").replace(/\D/g, "");

const escHtml = (s: string | number | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Texto da PRIMEIRA ocorrência de uma tag (sem prefixo de namespace). Vazio se ausente. */
function pick(xml: string, tag: string): string {
  const m = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`).exec(xml);
  return m?.[1]?.trim() ?? "";
}

/** Elemento INTEIRO (com tags) da PRIMEIRA ocorrência. Vazio se ausente. */
function pickBlock(xml: string, tag: string): string {
  const m = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>[\\s\\S]*?</(?:\\w+:)?${tag}>`).exec(xml);
  return m?.[0] ?? "";
}

/** Valor monetário pt-BR ("1234.56" → "1.234,56"). Vazio → "0,00". */
function brl(v: string | number | null | undefined): string {
  const n = Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return "0,00";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Data/hora ISO → "dd/mm/aaaa hh:mm". Mantém o texto cru se não casar. */
function dhFmt(dh: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(dh);
  if (!m) return dh;
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
}

/** Data ISO (aaaa-mm-dd) → "mm/aaaa" (competência). */
function competFmt(d: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(d);
  return m ? `${m[2]}/${m[1]}` : d;
}

/** CNPJ/CPF formatado. */
function docFmt(value: string): string {
  const d = onlyDigits(value);
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return value;
}

/** Chave (50 díg.) em grupos de 5 para leitura humana. */
function chaveFormatada(chave: string): string {
  return (chave.match(/.{1,5}/g) ?? []).join(" ");
}

/** CEP formatado. */
function cepFmt(v: string): string {
  const d = onlyDigits(v);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : v;
}

/** URL de consulta pública da NFS-e nacional pela chave (verificação de autenticidade). */
export function consultaPublicaNfseUrl(chave: string): string {
  return `https://www.nfse.gov.br/consultapublica/?tpc=1&chave=${onlyDigits(chave)}`;
}

/** Endereço de uma linha a partir de um bloco enderNac/end. */
function enderecoLinha(end: string): string {
  if (!end) return "";
  const partes = [
    pick(end, "xLgr"),
    pick(end, "nro") ? `nº ${pick(end, "nro")}` : "",
    pick(end, "xCpl"),
    pick(end, "xBairro"),
    [pick(end, "xMun"), pick(end, "UF")].filter(Boolean).join("/"),
    pick(end, "CEP") ? `CEP ${cepFmt(pick(end, "CEP"))}` : "",
  ].filter(Boolean);
  return partes.join(" - ");
}

export type DanfseData = {
  chave: string;
  nNFSe: string;
  nDFSe: string;
  serie: string;
  nDPS: string;
  tpAmb: string;            // 1=produção, 2=homologação (do infDPS)
  dhEmi: string;
  dhProc: string;
  dCompet: string;
  cStat: string;
  xLocPrestacao: string;
  emit: { nome: string; doc: string; im: string; ender: string; fone: string; email: string };
  toma: { nome: string; doc: string; ender: string };
  serv: { cTribNac: string; xTribNac: string; cNBS: string; xNBS: string; xDescServ: string };
  valores: {
    vServ: string; vBC: string; pAliq: string; vISSQN: string; vTotalRet: string; vLiq: string;
    issRetido: boolean; vRetINSS: string; vRetIRRF: string; vRetCSLL: string; vRetPis: string; vRetCofins: string;
  };
};

/** Parser do XML `<NFSe>` (infNFSe consolidado + DPS) → campos do DANFSE. */
export function parseNfse(nfseXml: string): DanfseData {
  const xml = nfseXml ?? "";
  // A parte ANTES de <DPS> tem o consolidado da SEFIN (emit + valores finais). O <valores> de
  // infNFSe (vBC/pAliqAplic/vISSQN/vTotalRet/vLiq) é o primeiro; o de dentro do DPS é outro.
  const preDps = xml.split(/<DPS[\s>]/)[0] ?? xml;
  const dps = pickBlock(xml, "infDPS");

  const idMatch = /Id\s*=\s*"NFS(\d{40,60})"/.exec(xml);
  const chave = idMatch?.[1] ?? onlyDigits(pick(xml, "chNFSe"));

  const emitBlock = pickBlock(preDps, "emit");
  const emitEnder = pickBlock(emitBlock, "enderNac");
  const valNFSe = pickBlock(preDps, "valores");

  const tomaBlock = pickBlock(dps, "toma");
  const tomaEnder = pickBlock(tomaBlock, "end");
  const cServ = pickBlock(dps, "cServ");
  const trib = pickBlock(dps, "trib");
  const tribMun = pickBlock(trib, "tribMun");
  const tribFed = pickBlock(trib, "tribFed");

  return {
    chave,
    nNFSe: pick(preDps, "nNFSe"),
    nDFSe: pick(preDps, "nDFSe"),
    serie: pick(dps, "serie"),
    nDPS: pick(dps, "nDPS"),
    tpAmb: pick(dps, "tpAmb"),
    dhEmi: pick(dps, "dhEmi"),
    dhProc: pick(preDps, "dhProc"),
    dCompet: pick(dps, "dCompet"),
    cStat: pick(preDps, "cStat"),
    xLocPrestacao: pick(preDps, "xLocPrestacao"),
    emit: {
      nome: pick(emitBlock, "xNome"),
      doc: pick(emitBlock, "CNPJ") || pick(emitBlock, "CPF"),
      im: pick(emitBlock, "IM"),
      ender: enderecoLinha(emitEnder),
      fone: pick(emitBlock, "fone"),
      email: pick(emitBlock, "email"),
    },
    toma: {
      nome: pick(tomaBlock, "xNome"),
      doc: pick(tomaBlock, "CNPJ") || pick(tomaBlock, "CPF"),
      ender: enderecoLinha(tomaEnder),
    },
    serv: {
      cTribNac: pick(cServ, "cTribNac"),
      xTribNac: pick(preDps, "xTribNac"),
      cNBS: pick(cServ, "cNBS"),
      xNBS: pick(preDps, "xNBS"),
      xDescServ: pick(cServ, "xDescServ"),
    },
    valores: {
      vServ: pick(pickBlock(dps, "vServPrest"), "vServ"),
      vBC: pick(valNFSe, "vBC"),
      pAliq: pick(valNFSe, "pAliqAplic"),
      vISSQN: pick(valNFSe, "vISSQN"),
      vTotalRet: pick(valNFSe, "vTotalRet"),
      vLiq: pick(valNFSe, "vLiq"),
      issRetido: pick(tribMun, "tpRetISSQN") === "2",
      vRetINSS: pick(tribFed, "vRetCP"),
      vRetIRRF: pick(tribFed, "vRetIRRF"),
      vRetCSLL: pick(tribFed, "vRetCSLL"),
      vRetPis: pick(pickBlock(tribFed, "piscofins"), "vPis"),
      vRetCofins: pick(pickBlock(tribFed, "piscofins"), "vCofins"),
    },
  };
}

function box(label: string, value: string): string {
  return `<div class="cell"><span class="lbl">${escHtml(label)}</span><span class="val">${escHtml(value) || "&nbsp;"}</span></div>`;
}

function renderHtml(d: DanfseData): string {
  const homolog =
    d.tpAmb === "2"
      ? `<div class="homolog">AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL</div>`
      : "";
  const v = d.valores;
  const retLinhas = [
    v.issRetido ? box("ISS RETIDO (TOMADOR)", brl(v.vISSQN)) : "",
    Number(v.vRetINSS) ? box("INSS RETIDO", brl(v.vRetINSS)) : "",
    Number(v.vRetIRRF) ? box("IRRF RETIDO", brl(v.vRetIRRF)) : "",
    Number(v.vRetCSLL) ? box("CSLL RETIDO", brl(v.vRetCSLL)) : "",
    Number(v.vRetPis) ? box("PIS RETIDO", brl(v.vRetPis)) : "",
    Number(v.vRetCofins) ? box("COFINS RETIDO", brl(v.vRetCofins)) : "",
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>NFS-e ${escHtml(d.nNFSe)} - ${escHtml(d.chave)}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: A4 portrait; margin: 8mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #000; margin: 0; }
  .danfse { width: 194mm; margin: 0 auto; }
  .row { display: flex; }
  .cell { border: 1px solid #000; padding: 2px 5px; flex: 1; overflow: hidden; }
  .lbl { display: block; font-size: 7px; color: #333; text-transform: uppercase; }
  .val { display: block; font-size: 11px; font-weight: bold; }
  .header { display: flex; align-items: stretch; border: 1px solid #000; }
  .header .id { flex: 2; padding: 6px; text-align: center; border-right: 1px solid #000; }
  .header .qr { flex: 1; padding: 6px; text-align: center; }
  .header .id .t1 { font-size: 13px; font-weight: bold; }
  .header .id .t2 { font-size: 9px; }
  .header .id .num { font-size: 16px; font-weight: bold; margin-top: 4px; }
  .qr svg { width: 110px; height: 110px; }
  .chave { font-family: "Courier New", monospace; font-size: 9px; word-spacing: 2px; margin-top: 3px; }
  .secao { font-weight: bold; background: #eee; border: 1px solid #000; padding: 1px 5px; margin-top: 5px; text-transform: uppercase; }
  .desc { border: 1px solid #000; padding: 4px 5px; white-space: pre-wrap; }
  .homolog { text-align: center; color: #b00; font-weight: bold; border: 2px solid #b00; padding: 4px; margin: 4px 0; letter-spacing: 1px; }
  .note { font-size: 7px; color: #555; margin-top: 6px; text-align: center; }
  .toolbar { text-align: center; padding: 10px; background: #f3f4f6; border-bottom: 1px solid #ccc; }
  .toolbar button { font-size: 13px; font-weight: bold; padding: 7px 16px; cursor: pointer; border: 1px solid #555; border-radius: 4px; background: #fff; }
  .toolbar .hint { display: block; font-size: 10px; color: #555; margin-top: 4px; }
  @media print { .no-print { display: none !important; } @page { size: A4 portrait; margin: 8mm; } }
</style>
</head>
<body>
<div class="toolbar no-print">
  <button onclick="window.print()">🖨️ Imprimir / Salvar como PDF</button>
  <span class="hint">Na janela de impressão, escolha "Salvar como PDF" como destino.</span>
</div>
<div class="danfse">
  ${homolog}

  <div class="header">
    <div class="id">
      <div class="t1">NFS-e — Nota Fiscal de Serviços Eletrônica</div>
      <div class="t2">Sistema Nacional NFS-e</div>
      <div class="num">Nº ${escHtml(d.nNFSe)}</div>
      <div class="t2">Série ${escHtml(d.serie)} · DPS ${escHtml(d.nDPS)} · DFe ${escHtml(d.nDFSe)}</div>
      <div class="t2">Emissão ${escHtml(dhFmt(d.dhEmi))} · Competência ${escHtml(competFmt(d.dCompet))}</div>
      <div class="chave">${escHtml(chaveFormatada(d.chave))}</div>
    </div>
    <div class="qr">
      ${qrCodeSvg(consultaPublicaNfseUrl(d.chave))}
      <div style="font-size:7px;margin-top:2px">Consulte em<br/>nfse.gov.br</div>
    </div>
  </div>

  <div class="secao">Prestador de Serviços</div>
  <div class="row">
    ${box("NOME / RAZÃO SOCIAL", d.emit.nome)}
    ${box("CNPJ/CPF", docFmt(d.emit.doc))}
    ${box("INSCRIÇÃO MUNICIPAL", d.emit.im)}
  </div>
  <div class="row">
    ${box("ENDEREÇO", d.emit.ender)}
  </div>
  <div class="row">
    ${box("TELEFONE", d.emit.fone)}
    ${box("E-MAIL", d.emit.email)}
  </div>

  <div class="secao">Tomador de Serviços</div>
  <div class="row">
    ${box("NOME / RAZÃO SOCIAL", d.toma.nome || "—")}
    ${box("CNPJ/CPF", d.toma.doc ? docFmt(d.toma.doc) : "—")}
  </div>
  ${d.toma.ender ? `<div class="row">${box("ENDEREÇO", d.toma.ender)}</div>` : ""}

  <div class="secao">Serviço Prestado</div>
  <div class="row">
    ${box("CÓD. TRIBUTAÇÃO NACIONAL", d.serv.cTribNac)}
    ${box("LOCAL DA PRESTAÇÃO", d.xLocPrestacao)}
    ${box("CÓD. NBS", d.serv.cNBS)}
  </div>
  <div class="row">${box("TRIBUTAÇÃO NACIONAL", d.serv.xTribNac)}</div>
  <div class="secao" style="margin-top:0;background:#fff;border-top:0">Discriminação dos Serviços</div>
  <div class="desc">${escHtml(d.serv.xDescServ)}</div>

  <div class="secao">Valores e Tributos</div>
  <div class="row">
    ${box("VALOR DO SERVIÇO", brl(v.vServ))}
    ${box("BASE DE CÁLCULO ISS", brl(v.vBC))}
    ${box("ALÍQUOTA ISS (%)", brl(v.pAliq))}
    ${box("VALOR DO ISS", brl(v.vISSQN))}
    ${box("ISS RETIDO?", v.issRetido ? "SIM" : "NÃO")}
  </div>
  ${retLinhas.length ? `<div class="row">${retLinhas.join("")}</div>` : ""}
  <div class="row">
    ${box("TOTAL DE RETENÇÕES", brl(v.vTotalRet))}
    ${box("VALOR LÍQUIDO", brl(v.vLiq))}
  </div>

  <div class="note">
    DANFSE gerado pela plataforma a partir do XML autorizado da NFS-e nacional. Para PDF, use
    "Imprimir &rarr; Salvar como PDF" no navegador. Consulta de autenticidade: nfse.gov.br.
  </div>
</div>
</body>
</html>`;
}

/**
 * Gera o DANFSE a partir do XML `<NFSe>` autorizado. Retorno pronto para `downloadDocument`
 * embrulhar: HTML printable (text/html), salvável como PDF pelo navegador.
 */
export function buildDanfse(nfseXml: string): { contentType: string; body: Buffer; filename: string } {
  const data = parseNfse(nfseXml);
  const html = renderHtml(data);
  return {
    contentType: "text/html; charset=utf-8",
    body: Buffer.from(html, "utf8"),
    filename: `NFSE-${data.nNFSe || data.chave || "nfse"}.html`,
  };
}

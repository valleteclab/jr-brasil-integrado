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
import { normalizeDocumento } from "@/lib/fiscal/documento";
import { normalizeDfeKey } from "../sefaz/chave";

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
  const d = normalizeDocumento(value);
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
  return `https://www.nfse.gov.br/consultapublica/?tpc=1&chave=${normalizeDfeKey(chave)}`;
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

  const idMatch = /Id\s*=\s*"NFS([A-Z0-9]{40,60})"/i.exec(xml);
  const chave = normalizeDfeKey(idMatch?.[1] ?? pick(xml, "chNFSe"));

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

/** Célula rotulada (label em cima, valor embaixo) — unidade base do grid. */
function cel(label: string, value: string, flex = 1): string {
  return `<div class="cel" style="flex:${flex}"><span class="lbl">${escHtml(label)}</span><span class="val">${escHtml(value) || "&nbsp;"}</span></div>`;
}

/** Linha da tabela de tributos (label + valor R$), só se o valor for > 0 ou forçado. */
function tribRow(label: string, value: string): string {
  return `<tr><td>${escHtml(label)}</td><td class="r">R$ ${escHtml(brl(value))}</td></tr>`;
}

export type DanfseOptions = { logoDataUrl?: string | null };

function renderHtml(d: DanfseData, opts?: DanfseOptions): string {
  const homolog =
    d.tpAmb === "2"
      ? `<div class="homolog">AMBIENTE DE HOMOLOGAÇÃO — SEM VALOR FISCAL</div>`
      : "";
  const v = d.valores;
  const logo = opts?.logoDataUrl
    ? `<img class="logo" src="${escHtml(opts.logoDataUrl)}" alt="logo"/>`
    : `<div class="logo-ph">NFS-e</div>`;

  // Tributos federais retidos (só os preenchidos).
  const fedRows = [
    ["INSS", v.vRetINSS],
    ["IRRF", v.vRetIRRF],
    ["CSLL", v.vRetCSLL],
    ["PIS", v.vRetPis],
    ["COFINS", v.vRetCofins],
  ].filter(([, val]) => Number(val) > 0) as [string, string][];

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>NFS-e ${escHtml(d.nNFSe)} - ${escHtml(d.chave)}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: A4 portrait; margin: 7mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5px; color: #1a1a1a; margin: 0; background: #f5f6f8; }
  .doc { width: 196mm; margin: 0 auto; background: #fff; border: 1px solid #243b53; }
  /* Cabeçalho institucional */
  .cab { display: flex; align-items: center; gap: 10px; background: #243b53; color: #fff; padding: 8px 12px; }
  .cab .logo { max-height: 52px; max-width: 120px; background: #fff; padding: 3px; border-radius: 3px; }
  .cab .logo-ph { font-size: 22px; font-weight: 800; letter-spacing: 1px; border: 2px solid #fff; padding: 4px 10px; border-radius: 4px; }
  .cab .tit { flex: 1; line-height: 1.25; }
  .cab .tit .t1 { font-size: 15px; font-weight: 800; letter-spacing: .5px; }
  .cab .tit .t2 { font-size: 10px; opacity: .9; }
  .cab .tit .t3 { font-size: 9px; opacity: .8; margin-top: 2px; }
  .cab .qr { text-align: center; }
  .cab .qr svg { width: 96px; height: 96px; background: #fff; padding: 3px; border-radius: 3px; }
  .cab .qr div { font-size: 7px; margin-top: 2px; }
  /* Faixa de identificação */
  .ident { display: flex; border-bottom: 1px solid #243b53; }
  .ident .cel { border-right: 1px solid #ccd3da; }
  .ident .cel:last-child { border-right: 0; }
  .chave-line { padding: 3px 8px; background: #eef1f5; border-bottom: 1px solid #ccd3da; font-size: 8px; }
  .chave-line b { font-family: "Courier New", monospace; font-size: 10px; letter-spacing: .5px; }
  /* Seções */
  .sec { background: #243b53; color: #fff; font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: .5px; padding: 3px 8px; }
  .grid { display: flex; flex-wrap: wrap; }
  .cel { padding: 3px 8px; border-right: 1px solid #e2e6ea; border-bottom: 1px solid #e2e6ea; min-width: 0; overflow: hidden; }
  .cel:last-child { border-right: 0; }
  .lbl { display: block; font-size: 6.5px; color: #5a6b7b; text-transform: uppercase; letter-spacing: .3px; }
  .val { display: block; font-size: 10.5px; font-weight: 700; word-wrap: break-word; }
  .desc { padding: 5px 8px; white-space: pre-wrap; border-bottom: 1px solid #e2e6ea; line-height: 1.35; }
  /* Valor total destaque */
  .total { display: flex; align-items: center; justify-content: space-between; background: #eef7ee; border-top: 2px solid #2e7d32; border-bottom: 2px solid #2e7d32; padding: 7px 12px; }
  .total .lab { font-size: 11px; font-weight: 700; color: #1b5e20; text-transform: uppercase; }
  .total .num { font-size: 22px; font-weight: 800; color: #1b5e20; }
  /* Tributos */
  .tribs { display: flex; gap: 10px; padding: 6px 8px; }
  .tribs table { border-collapse: collapse; width: 100%; font-size: 9px; }
  .tribs caption { text-align: left; font-weight: 700; font-size: 8.5px; text-transform: uppercase; color: #243b53; padding-bottom: 2px; }
  .tribs td { border: 1px solid #d6dbe1; padding: 2px 6px; }
  .tribs td.r { text-align: right; font-weight: 700; }
  .badge { display: inline-block; font-size: 9px; font-weight: 700; padding: 1px 7px; border-radius: 10px; }
  .badge.sim { background: #fdecea; color: #b71c1c; }
  .badge.nao { background: #e8f5e9; color: #1b5e20; }
  .homolog { text-align: center; color: #b71c1c; font-weight: 800; border: 2px solid #b71c1c; padding: 4px; margin: 6px 8px 0; letter-spacing: 1px; }
  .note { font-size: 7px; color: #5a6b7b; padding: 6px 8px; text-align: center; border-top: 1px solid #e2e6ea; }
  .toolbar { text-align: center; padding: 10px; background: #fff; border-bottom: 1px solid #ddd; }
  .toolbar button { font-size: 13px; font-weight: 700; padding: 8px 18px; cursor: pointer; border: 0; border-radius: 5px; background: #243b53; color: #fff; }
  .toolbar .hint { display: block; font-size: 10px; color: #555; margin-top: 5px; }
  @media print { body { background: #fff; } .no-print { display: none !important; } .doc { border: 0; width: auto; } @page { size: A4 portrait; margin: 7mm; } }
</style>
</head>
<body>
<div class="toolbar no-print">
  <button onclick="window.print()">🖨️ Imprimir / Salvar como PDF</button>
  <span class="hint">Na janela de impressão, escolha "Salvar como PDF" como destino.</span>
</div>
<div class="doc">
  <div class="cab">
    ${logo}
    <div class="tit">
      <div class="t1">NOTA FISCAL DE SERVIÇOS ELETRÔNICA — NFS-e</div>
      <div class="t2">DANFSE · Documento Auxiliar da NFS-e</div>
      <div class="t3">Sistema Nacional da NFS-e</div>
    </div>
    <div class="qr">
      ${qrCodeSvg(consultaPublicaNfseUrl(d.chave))}
      <div>Consulte em<br/>nfse.gov.br</div>
    </div>
  </div>
  ${homolog}

  <div class="ident">
    ${cel("Número da NFS-e", d.nNFSe, 1.2)}
    ${cel("Competência", competFmt(d.dCompet))}
    ${cel("Data/Hora da Emissão", dhFmt(d.dhEmi), 1.5)}
    ${cel("Série / DPS", `${d.serie} / ${d.nDPS}`)}
    ${cel("Situação", d.cStat === "100" ? "Autorizada" : d.cStat)}
  </div>
  <div class="chave-line">CHAVE DE ACESSO &nbsp; <b>${escHtml(chaveFormatada(d.chave))}</b></div>

  <div class="sec">Prestador de Serviços</div>
  <div class="grid">
    ${cel("Nome / Razão Social", d.emit.nome, 2)}
    ${cel("CNPJ / CPF", docFmt(d.emit.doc))}
    ${cel("Inscrição Municipal", d.emit.im)}
  </div>
  <div class="grid">
    ${cel("Endereço", d.emit.ender, 3)}
    ${cel("Telefone", d.emit.fone)}
    ${cel("E-mail", d.emit.email, 1.4)}
  </div>

  <div class="sec">Tomador de Serviços</div>
  <div class="grid">
    ${cel("Nome / Razão Social", d.toma.nome || "—", 2)}
    ${cel("CNPJ / CPF", d.toma.doc ? docFmt(d.toma.doc) : "—")}
  </div>
  ${d.toma.ender ? `<div class="grid">${cel("Endereço", d.toma.ender, 1)}</div>` : ""}

  <div class="sec">Serviço Prestado</div>
  <div class="grid">
    ${cel("Cód. Tributação Nacional", d.serv.cTribNac)}
    ${cel("Cód. NBS", d.serv.cNBS)}
    ${cel("Local da Prestação", d.xLocPrestacao, 1.5)}
  </div>
  ${d.serv.xTribNac ? `<div class="grid">${cel("Item da Lista de Serviços (Tributação Nacional)", d.serv.xTribNac, 1)}</div>` : ""}
  <div class="cel" style="border-right:0;background:#f3f5f7"><span class="lbl">Discriminação dos Serviços</span></div>
  <div class="desc">${escHtml(d.serv.xDescServ)}</div>

  <div class="total">
    <span class="lab">Valor Total da NFS-e</span>
    <span class="num">R$ ${escHtml(brl(v.vServ))}</span>
  </div>

  <div class="sec">Tributos</div>
  <div class="tribs">
    <table>
      <caption>ISSQN — Município</caption>
      ${tribRow("Base de Cálculo", v.vBC)}
      <tr><td>Alíquota</td><td class="r">${escHtml(brl(v.pAliq))}%</td></tr>
      ${tribRow("Valor do ISS", v.vISSQN)}
      <tr><td>ISS Retido pelo Tomador</td><td class="r"><span class="badge ${v.issRetido ? "sim" : "nao"}">${v.issRetido ? "SIM" : "NÃO"}</span></td></tr>
    </table>
    <table>
      <caption>Retenções Federais</caption>
      ${fedRows.length ? fedRows.map(([k, val]) => tribRow(k, val)).join("") : `<tr><td colspan="2" style="text-align:center;color:#888">Sem retenções federais</td></tr>`}
      ${tribRow("Total de Retenções", v.vTotalRet)}
      <tr><td><b>Valor Líquido</b></td><td class="r"><b>R$ ${escHtml(brl(v.vLiq))}</b></td></tr>
    </table>
  </div>

  <div class="note">
    DANFSE gerado pela plataforma a partir do XML autorizado da NFS-e nacional (DFe ${escHtml(d.nDFSe)} ·
    processada em ${escHtml(dhFmt(d.dhProc))}). Para salvar em PDF, use "Imprimir &rarr; Salvar como PDF".
    A autenticidade pode ser verificada pelo QR Code ou em nfse.gov.br.
  </div>
</div>
</body>
</html>`;
}

/**
 * Gera o DANFSE a partir do XML `<NFSe>` autorizado. Retorno pronto para `downloadDocument`
 * embrulhar: HTML printable (text/html), salvável como PDF pelo navegador.
 */
export function buildDanfse(nfseXml: string, opts?: DanfseOptions): { contentType: string; body: Buffer; filename: string } {
  const data = parseNfse(nfseXml);
  const html = renderHtml(data, opts);
  return {
    contentType: "text/html; charset=utf-8",
    body: Buffer.from(html, "utf8"),
    filename: `NFSE-${data.nNFSe || data.chave || "nfse"}.html`,
  };
}

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
  /** Município de incidência do ISSQN (consolidado pela SEFIN). */
  xLocIncid: string;
  emit: { nome: string; doc: string; im: string; ender: string; fone: string; email: string };
  toma: { nome: string; doc: string; im: string; ender: string; fone: string; email: string };
  /** Intermediário do serviço (o DANFSE oficial mostra "Não informado" quando ausente). */
  interm: { nome: string; doc: string } | null;
  serv: { cTribNac: string; xTribNac: string; cTribMun: string; cNBS: string; xNBS: string; xDescServ: string };
  /** Código da tributação do ISSQN (1=Tributável, 2=Exportação, 3=Não incidência, 4=Imunidade). */
  tribISSQN: string;
  valores: {
    vServ: string; vDescIncond: string; vDedRed: string; vBC: string; pAliq: string; vISSQN: string; vTotalRet: string; vLiq: string;
    issRetido: boolean; vRetINSS: string; vRetIRRF: string; vRetCSLL: string; vRetPis: string; vRetCofins: string;
  };
  /** Informações complementares do DPS (xInfComp) — o oficial imprime a seção sempre. */
  xInfComp: string;
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
  const intermBlock = pickBlock(dps, "interm");
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
    xLocIncid: pick(preDps, "xLocIncid"),
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
      im: pick(tomaBlock, "IM"),
      ender: enderecoLinha(tomaEnder),
      fone: pick(tomaBlock, "fone"),
      email: pick(tomaBlock, "email"),
    },
    interm: intermBlock
      ? { nome: pick(intermBlock, "xNome"), doc: pick(intermBlock, "CNPJ") || pick(intermBlock, "CPF") }
      : null,
    serv: {
      cTribNac: pick(cServ, "cTribNac"),
      xTribNac: pick(preDps, "xTribNac"),
      cTribMun: pick(cServ, "cTribMun"),
      cNBS: pick(cServ, "cNBS"),
      xNBS: pick(preDps, "xNBS"),
      xDescServ: pick(cServ, "xDescServ"),
    },
    tribISSQN: pick(tribMun, "tribISSQN"),
    valores: {
      vServ: pick(pickBlock(dps, "vServPrest"), "vServ"),
      vDescIncond: pick(pickBlock(dps, "vDescCondIncond"), "vDescIncond"),
      vDedRed: pick(pickBlock(dps, "vDedRed"), "vDR"),
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
    xInfComp: pick(dps, "xInfComp"),
  };
}

/** Rótulo da tributação do ISSQN (campo tribISSQN do DPS), como no DANFSE oficial. */
function tribISSQNLabel(cod: string): string {
  switch (cod) {
    case "1": return "Operação Tributável";
    case "2": return "Exportação de Serviço";
    case "3": return "Não Incidência";
    case "4": return "Imunidade";
    default: return cod || "—";
  }
}

/** Célula rotulada (label em cima, valor embaixo) — unidade base do grid, como no DANFSE oficial. */
function cel(label: string, value: string, flex = 1): string {
  return `<div class="cel" style="flex:${flex}"><span class="lbl">${escHtml(label)}</span><span class="val">${escHtml(value) || "&nbsp;"}</span></div>`;
}

export type DanfseOptions = { logoDataUrl?: string | null };

function renderHtml(d: DanfseData, opts?: DanfseOptions): string {
  const homolog =
    d.tpAmb === "2"
      ? `<div class="homolog">AMBIENTE DE HOMOLOGAÇÃO — SEM VALOR FISCAL</div>`
      : "";
  const v = d.valores;
  // O DANFSE oficial não leva a logo da empresa no topo (leva a marca da NFS-e). Quando a empresa
  // tem logo, mostramos discretamente dentro da seção do emitente.
  const logoEmit = opts?.logoDataUrl
    ? `<img class="logo-emit" src="${escHtml(opts.logoDataUrl)}" alt="logo"/>`
    : "";

  const cTribNacFmt = d.serv.cTribNac
    ? `${d.serv.cTribNac.replace(/(\d{2})(\d{2})(\d{2})/, "$1.$2.$3")}${d.serv.xTribNac ? ` - ${d.serv.xTribNac}` : ""}`
    : "—";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>NFS-e ${escHtml(d.nNFSe)} - ${escHtml(d.chave)}</title>
<style>
  /* Layout no padrão do DANFSe v1.0 do Sistema Nacional: monocromático, bordas finas, seções
     com barra cinza e células rotuladas. */
  * { box-sizing: border-box; }
  @page { size: A4 portrait; margin: 7mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9px; color: #000; margin: 0; background: #f5f6f8; }
  .doc { width: 196mm; margin: 0 auto; background: #fff; border: 1px solid #000; }
  /* Cabeçalho: marca NFS-e à esquerda, chave ao centro, QR à direita */
  .cab { display: flex; align-items: stretch; border-bottom: 1px solid #000; }
  .cab .brand { width: 34mm; display: flex; flex-direction: column; align-items: center; justify-content: center; border-right: 1px solid #000; padding: 6px; text-align: center; }
  .cab .brand .nfse { font-size: 24px; font-weight: 800; letter-spacing: .5px; }
  .cab .brand .nfse small { font-size: 10px; font-weight: 700; vertical-align: super; }
  .cab .brand .ver { font-size: 8px; margin-top: 3px; }
  .cab .mid { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 6px 10px; }
  .cab .mid .t1 { font-size: 11px; font-weight: 700; text-align: center; margin-bottom: 4px; }
  .cab .mid .clab { font-size: 7.5px; text-transform: uppercase; color: #333; }
  .cab .mid .chv { font-family: "Courier New", monospace; font-size: 10.5px; font-weight: 700; letter-spacing: .3px; }
  .cab .mid .url { font-size: 7.5px; color: #333; margin-top: 3px; }
  .cab .qr { width: 30mm; display: flex; align-items: center; justify-content: center; border-left: 1px solid #000; padding: 4px; }
  .cab .qr svg { width: 26mm; height: 26mm; }
  /* Linha de identificação */
  .grid { display: flex; flex-wrap: wrap; }
  .cel { padding: 2px 6px; border-right: 1px solid #999; border-bottom: 1px solid #999; min-width: 0; overflow: hidden; }
  .cel:last-child { border-right: 0; }
  .lbl { display: block; font-size: 6.5px; color: #333; }
  .val { display: block; font-size: 9.5px; font-weight: 700; word-wrap: break-word; }
  /* Seções (barra cinza, texto preto centralizado — como o oficial) */
  .sec { background: #d9d9d9; color: #000; font-weight: 700; font-size: 8.5px; text-align: center; text-transform: uppercase; padding: 2px 6px; border-bottom: 1px solid #999; }
  .desc { padding: 4px 6px; white-space: pre-wrap; border-bottom: 1px solid #999; line-height: 1.35; min-height: 34px; }
  .naoinf { padding: 3px 6px; border-bottom: 1px solid #999; color: #333; }
  .logo-emit { max-height: 34px; max-width: 90px; float: right; margin: 2px 4px; }
  /* Valor líquido destacado (faixa sóbria) */
  .liq { display: flex; align-items: center; justify-content: space-between; padding: 5px 10px; border-bottom: 1px solid #000; background: #efefef; }
  .liq .lab { font-size: 10px; font-weight: 700; text-transform: uppercase; }
  .liq .num { font-size: 16px; font-weight: 800; }
  .homolog { text-align: center; color: #000; font-weight: 800; border: 2px solid #000; padding: 3px; margin: 4px 6px; letter-spacing: 1px; }
  .note { font-size: 7px; color: #333; padding: 4px 6px; text-align: center; }
  .toolbar { text-align: center; padding: 10px; background: #fff; border-bottom: 1px solid #ddd; }
  .toolbar button { font-size: 13px; font-weight: 700; padding: 8px 18px; cursor: pointer; border: 0; border-radius: 5px; background: #333; color: #fff; }
  .toolbar .hint { display: block; font-size: 10px; color: #555; margin-top: 5px; }
  @media print { body { background: #fff; } .no-print { display: none !important; } .doc { border: 1px solid #000; width: auto; } @page { size: A4 portrait; margin: 7mm; } }
</style>
</head>
<body>
<div class="toolbar no-print">
  <button onclick="window.print()">🖨️ Imprimir / Salvar como PDF</button>
  <span class="hint">Na janela de impressão, escolha "Salvar como PDF" como destino.</span>
</div>
<div class="doc">
  <div class="cab">
    <div class="brand">
      <div class="nfse">NFS<small>-e</small></div>
      <div class="ver">DANFSe v1.0<br/>Documento Auxiliar da NFS-e</div>
    </div>
    <div class="mid">
      <div class="t1">DANFSe — Documento Auxiliar da Nota Fiscal de Serviço Eletrônica</div>
      <div class="clab">Chave de Acesso da NFS-e</div>
      <div class="chv">${escHtml(chaveFormatada(d.chave))}</div>
      <div class="url">Consulta pela chave de acesso ou QR Code em www.nfse.gov.br/consultapublica</div>
    </div>
    <div class="qr">${qrCodeSvg(consultaPublicaNfseUrl(d.chave))}</div>
  </div>
  ${homolog}

  <div class="grid">
    ${cel("Número da NFS-e", d.nNFSe)}
    ${cel("Competência da NFS-e", competFmt(d.dCompet))}
    ${cel("Data e Hora da emissão da NFS-e", dhFmt(d.dhProc || d.dhEmi), 1.4)}
    ${cel("Número da DPS", d.nDPS)}
    ${cel("Série da DPS", d.serie)}
    ${cel("Data e Hora da emissão da DPS", dhFmt(d.dhEmi), 1.4)}
  </div>

  <div class="sec">Emitente da NFS-e</div>
  <div class="grid">
    ${cel("CNPJ / CPF / NIF", docFmt(d.emit.doc), 1.2)}
    ${cel("Inscrição Municipal", d.emit.im || "—")}
    ${cel("Telefone", d.emit.fone || "—")}
  </div>
  <div class="grid">${cel("Nome / Nome Empresarial", `${d.emit.nome}`, 1)}</div>
  <div class="grid">
    ${cel("E-mail", d.emit.email || "—", 1)}
  </div>
  <div class="grid">${cel("Endereço", d.emit.ender || "—", 1)}</div>

  <div class="sec">Tomador do Serviço</div>
  ${d.toma.nome || d.toma.doc ? `
  <div class="grid">
    ${cel("CNPJ / CPF / NIF", d.toma.doc ? docFmt(d.toma.doc) : "—", 1.2)}
    ${cel("Inscrição Municipal", d.toma.im || "—")}
    ${cel("Telefone", d.toma.fone || "—")}
  </div>
  <div class="grid">${cel("Nome / Nome Empresarial", d.toma.nome || "—", 1)}</div>
  <div class="grid">${cel("E-mail", d.toma.email || "—", 1)}</div>
  ${d.toma.ender ? `<div class="grid">${cel("Endereço", d.toma.ender, 1)}</div>` : ""}
  ` : `<div class="naoinf">Não informado</div>`}

  <div class="sec">Intermediário do Serviço</div>
  ${d.interm ? `
  <div class="grid">
    ${cel("CNPJ / CPF / NIF", d.interm.doc ? docFmt(d.interm.doc) : "—", 1)}
    ${cel("Nome / Nome Empresarial", d.interm.nome || "—", 2)}
  </div>
  ` : `<div class="naoinf">Não informado</div>`}

  <div class="sec">Serviço Prestado</div>
  <div class="grid">${cel("Código de Tributação Nacional", cTribNacFmt, 1)}</div>
  <div class="grid">
    ${cel("Código de Tributação Municipal", d.serv.cTribMun || "—")}
    ${cel("Código NBS", d.serv.cNBS || "—")}
    ${cel("Local da Prestação", d.xLocPrestacao || "—", 1.4)}
    ${cel("País da Prestação", "Brasil")}
  </div>
  <div class="grid"><div class="cel" style="flex:1;border-right:0"><span class="lbl">Descrição do Serviço</span></div></div>
  <div class="desc">${escHtml(d.serv.xDescServ)}</div>

  <div class="sec">Tributação Municipal</div>
  <div class="grid">
    ${cel("Tributação do ISSQN", tribISSQNLabel(d.tribISSQN), 1.2)}
    ${cel("Município de Incidência do ISSQN", d.xLocIncid || d.xLocPrestacao || "—", 1.4)}
    ${cel("ISSQN Retido pelo Tomador", v.issRetido ? "SIM" : "NÃO")}
  </div>
  <div class="grid">
    ${cel("Base de Cálculo do ISSQN", `R$ ${brl(v.vBC)}`)}
    ${cel("Alíquota do ISSQN", `${brl(v.pAliq)}%`)}
    ${cel("Valor do ISSQN", `R$ ${brl(v.vISSQN)}`)}
  </div>

  <div class="sec">Tributação Federal</div>
  <div class="grid">
    ${cel("Retenção do IRRF", `R$ ${brl(v.vRetIRRF)}`)}
    ${cel("Retenção da CSLL", `R$ ${brl(v.vRetCSLL)}`)}
    ${cel("Retenção da CP (INSS)", `R$ ${brl(v.vRetINSS)}`)}
    ${cel("Retenção do PIS", `R$ ${brl(v.vRetPis)}`)}
    ${cel("Retenção da COFINS", `R$ ${brl(v.vRetCofins)}`)}
  </div>

  <div class="sec">Valores da NFS-e</div>
  <div class="grid">
    ${cel("Valor do Serviço", `R$ ${brl(v.vServ)}`)}
    ${cel("Desconto Incondicionado", `R$ ${brl(v.vDescIncond)}`)}
    ${cel("Total de Deduções / Reduções", `R$ ${brl(v.vDedRed)}`)}
    ${cel("Total de Retenções", `R$ ${brl(v.vTotalRet)}`)}
  </div>
  <div class="liq">
    <span class="lab">Valor Líquido da NFS-e</span>
    <span class="num">R$ ${escHtml(brl(v.vLiq))}</span>
  </div>

  <div class="sec">Informações Complementares</div>
  <div class="naoinf">${d.xInfComp ? escHtml(d.xInfComp) : "Não informado"}${logoEmit}</div>

  <div class="note">
    DANFSE gerado a partir do XML autorizado da NFS-e do Sistema Nacional (DFe ${escHtml(d.nDFSe)} ·
    processada em ${escHtml(dhFmt(d.dhProc))} · situação ${escHtml(d.cStat === "100" ? "Autorizada" : d.cStat)}).
    A autenticidade pode ser verificada pelo QR Code ou pela chave de acesso em www.nfse.gov.br.
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

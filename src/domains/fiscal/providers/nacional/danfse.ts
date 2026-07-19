/**
 * DANFSE (Documento Auxiliar da NFS-e) — representação gráfica da NFS-e do Sistema Nacional.
 *
 * Gera o DANFSE a partir do XML `<NFSe>` AUTORIZADO (devolvido pela SEFIN em GET /nfse/{chave}),
 * como CLONE do leiaute oficial "DANFSe v1.0" (o mesmo do Emissor Nacional/ADN): cabeçalho com a
 * marca NFS-e + prefeitura, chave de acesso com QR à direita, seções EMITENTE/TOMADOR com o título
 * na primeira célula, grid de 4 colunas com rótulo em negrito e valor embaixo, TRIBUTAÇÃO
 * MUNICIPAL/FEDERAL, VALOR TOTAL, TOTAIS APROXIMADOS e INFORMAÇÕES COMPLEMENTARES.
 *
 * A SEFIN NÃO gera PDF (GET /danfse → 501); o ADN gera, mas está em desativação — este gerador é o
 * substituto. HTML autocontido (CSS A4) + QR SVG; o usuário salva como PDF pelo navegador.
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

/** "R$ x,yy" ou "-" quando vazio/zero (o oficial imprime "-" nos campos sem valor). */
function mon(v: string | number | null | undefined, sempre = false): string {
  const n = Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n) || (n === 0 && !sempre)) return "-";
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Data/hora ISO → "dd/mm/aaaa hh:mm:ss" (como no oficial). Mantém o texto cru se não casar. */
function dhFmt(dh: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(dh);
  if (!m) return dh || "-";
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}${m[6] ? `:${m[6]}` : ""}`;
}

/** Data ISO (aaaa-mm-dd) → "dd/mm/aaaa" (competência, como no oficial). */
function dataFmt(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d || "-";
}

/** CNPJ/CPF formatado. */
function docFmt(value: string): string {
  const d = normalizeDocumento(value);
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return value;
}

/** CEP formatado. */
function cepFmt(v: string): string {
  const d = onlyDigits(v);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : v || "-";
}

/** Telefone "(DD) NNNNN-NNNN" quando possível. */
function foneFmt(v: string): string {
  const d = onlyDigits(v);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v || "-";
}

/** URL de consulta pública da NFS-e nacional pela chave (verificação de autenticidade). */
export function consultaPublicaNfseUrl(chave: string): string {
  return `https://www.nfse.gov.br/consultapublica/?tpc=1&chave=${normalizeDfeKey(chave)}`;
}

/** Logradouro em uma linha (sem município/CEP — o oficial mostra em colunas separadas). */
function enderecoLogradouro(end: string): string {
  if (!end) return "";
  return [pick(end, "xLgr"), pick(end, "nro"), pick(end, "xCpl"), pick(end, "xBairro")]
    .filter(Boolean)
    .join(", ");
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
  /** Município emissor (prefeitura do cabeçalho) e locais de prestação/incidência. */
  xLocEmi: string;
  xLocPrestacao: string;
  xLocIncid: string;
  emit: { nome: string; doc: string; im: string; fone: string; email: string; log: string; mun: string; cep: string };
  toma: { nome: string; doc: string; im: string; fone: string; email: string; log: string; mun: string; cep: string };
  /** Intermediário do serviço (o oficial imprime "NÃO IDENTIFICADO NA NFS-e" quando ausente). */
  interm: { nome: string; doc: string } | null;
  serv: { cTribNac: string; xTribNac: string; cTribMun: string; cNBS: string; xDescServ: string };
  /** Simples Nacional na data de competência (opSimpNac) e regime de apuração pelo SN. */
  simpNac: string;
  regApSN: string;
  tribISSQN: string;        // 1=Tributável, 2=Exportação, 3=Não incidência, 4=Imunidade
  tpRetISSQN: string;       // 1=Não retido, 2=Retido pelo tomador, 3=Retido pelo intermediário
  valores: {
    vServ: string; vDescIncond: string; vDescCond: string; vDedRed: string;
    vBC: string; pAliq: string; vISSQN: string; vTotalRet: string; vLiq: string;
    vRetINSS: string; vRetIRRF: string; vRetCSLL: string; vRetPis: string; vRetCofins: string;
    totFed: string; totEst: string; totMun: string;
  };
  xInfComp: string;
  /** NFS-e substituída (chave), quando substituição — o oficial cita nas informações complementares. */
  chaveSubst: string;
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
  const totTrib = pickBlock(trib, "totTrib");

  const emitMun = [pick(emitEnder, "xMun"), pick(emitEnder, "UF")].filter(Boolean).join(" - ");
  // Tomador: o DPS só carrega o CÓDIGO do município (cMun). Quando é o mesmo do emitente (caso
  // comum, prestação local), reusamos o nome; senão mostramos o código IBGE.
  const tomaCMun = pick(tomaEnder, "cMun");
  const tomaMun = tomaCMun && tomaCMun === pick(emitEnder, "cMun") ? emitMun : (tomaCMun || "-");

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
    xLocEmi: pick(preDps, "xLocEmi"),
    xLocPrestacao: pick(preDps, "xLocPrestacao"),
    xLocIncid: pick(preDps, "xLocIncid"),
    emit: {
      nome: pick(emitBlock, "xNome"),
      doc: pick(emitBlock, "CNPJ") || pick(emitBlock, "CPF"),
      im: pick(emitBlock, "IM"),
      fone: pick(emitBlock, "fone"),
      email: pick(emitBlock, "email"),
      log: enderecoLogradouro(emitEnder),
      mun: emitMun,
      cep: pick(emitEnder, "CEP"),
    },
    toma: {
      nome: pick(tomaBlock, "xNome"),
      doc: pick(tomaBlock, "CNPJ") || pick(tomaBlock, "CPF"),
      im: pick(tomaBlock, "IM"),
      fone: pick(tomaBlock, "fone"),
      email: pick(tomaBlock, "email"),
      log: enderecoLogradouro(tomaEnder),
      mun: tomaMun,
      cep: pick(tomaEnder, "CEP"),
    },
    interm: intermBlock
      ? { nome: pick(intermBlock, "xNome"), doc: pick(intermBlock, "CNPJ") || pick(intermBlock, "CPF") }
      : null,
    serv: {
      cTribNac: pick(cServ, "cTribNac"),
      xTribNac: pick(preDps, "xTribNac"),
      cTribMun: pick(cServ, "cTribMun"),
      cNBS: pick(cServ, "cNBS"),
      xDescServ: pick(cServ, "xDescServ"),
    },
    simpNac: pick(dps, "opSimpNac"),
    regApSN: pick(dps, "regApTribSN"),
    tribISSQN: pick(tribMun, "tribISSQN"),
    tpRetISSQN: pick(tribMun, "tpRetISSQN"),
    valores: {
      vServ: pick(pickBlock(dps, "vServPrest"), "vServ"),
      vDescIncond: pick(pickBlock(dps, "vDescCondIncond"), "vDescIncond"),
      vDescCond: pick(pickBlock(dps, "vDescCondIncond"), "vDescCond"),
      vDedRed: pick(pickBlock(dps, "vDedRed"), "vDR"),
      vBC: pick(valNFSe, "vBC"),
      pAliq: pick(valNFSe, "pAliqAplic"),
      vISSQN: pick(valNFSe, "vISSQN"),
      vTotalRet: pick(valNFSe, "vTotalRet"),
      vLiq: pick(valNFSe, "vLiq"),
      vRetINSS: pick(tribFed, "vRetCP"),
      vRetIRRF: pick(tribFed, "vRetIRRF"),
      vRetCSLL: pick(tribFed, "vRetCSLL"),
      vRetPis: pick(pickBlock(tribFed, "piscofins"), "vPis"),
      vRetCofins: pick(pickBlock(tribFed, "piscofins"), "vCofins"),
      totFed: pick(totTrib, "vTotTribFed"),
      totEst: pick(totTrib, "vTotTribEst"),
      totMun: pick(totTrib, "vTotTribMun"),
    },
    xInfComp: pick(dps, "xInfComp"),
    chaveSubst: pick(pickBlock(dps, "subst"), "chSubstda"),
  };
}

/** Rótulos oficiais dos campos codificados do DPS. */
function tribISSQNLabel(cod: string): string {
  switch (cod) {
    case "1": return "Operação Tributável";
    case "2": return "Exportação de Serviço";
    case "3": return "Não Incidência";
    case "4": return "Imunidade";
    default: return cod || "-";
  }
}
function retISSQNLabel(cod: string): string {
  switch (cod) {
    case "1": return "Não Retido";
    case "2": return "Retido pelo Tomador";
    case "3": return "Retido pelo Intermediário";
    default: return cod || "-";
  }
}
function simpNacLabel(cod: string): string {
  switch (cod) {
    case "1": return "Não optante";
    case "2": return "Optante - MEI";
    case "3": return "Optante - ME/EPP";
    default: return cod || "-";
  }
}

/** Célula do grid oficial: rótulo em NEGRITO em cima, valor normal embaixo. */
function cel(label: string, value: string, flex = 1): string {
  return `<div class="cel" style="flex:${flex}"><span class="lbl">${escHtml(label)}</span><span class="val">${escHtml(value) || "-"}</span></div>`;
}

/** Célula-título de seção (EMITENTE/TOMADOR): nome da seção em caixa alta + subtítulo. */
function celSecao(titulo: string, sub: string, flex = 1): string {
  return `<div class="cel" style="flex:${flex}"><span class="sec-in">${escHtml(titulo)}</span><span class="val">${escHtml(sub) || "&nbsp;"}</span></div>`;
}

export type DanfseOptions = { logoDataUrl?: string | null };

function renderHtml(d: DanfseData, opts?: DanfseOptions): string {
  const v = d.valores;
  const homolog =
    d.tpAmb === "2"
      ? `<div class="homolog">AMBIENTE DE HOMOLOGAÇÃO — NFS-e SEM VALOR FISCAL</div>`
      : "";
  const cTribNacFmt = d.serv.cTribNac
    ? `${d.serv.cTribNac.replace(/(\d{2})(\d{2})(\d{2})/, "$1.$2.$3")}${d.serv.xTribNac ? ` - ${d.serv.xTribNac}` : ""}`
    : "-";
  const issRetido = d.tpRetISSQN === "2" || d.tpRetISSQN === "3";
  // Informações complementares: substituição + NBS + texto livre (como o oficial).
  const infComp = [
    d.chaveSubst ? `NFSe Subst: ${d.chaveSubst}` : "",
    d.serv.cNBS ? `NBS: ${d.serv.cNBS}` : "",
    d.xInfComp,
  ].filter(Boolean).join(" | ");
  const logoEmit = opts?.logoDataUrl ? `<img class="logo-emit" src="${escHtml(opts.logoDataUrl)}" alt=""/>` : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>NFS-e ${escHtml(d.nNFSe)} - ${escHtml(d.chave)}</title>
<style>
  /* Clone do leiaute oficial DANFSe v1.0 (Emissor Nacional): grid de 4 colunas sem bordas
     verticais, rótulos em negrito com valor embaixo, títulos de seção em caixa alta com filete
     grosso em cima. */
  * { box-sizing: border-box; }
  @page { size: A4 portrait; margin: 6mm; }
  body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; font-size: 8px; color: #000; margin: 0; background: #f5f6f8; }
  .doc { width: 198mm; margin: 0 auto; background: #fff; border: 1px solid #777; padding: 0 0 2mm; position: relative; }
  /* Cabeçalho */
  .cab { display: flex; align-items: center; border-bottom: 1px solid #777; }
  .cab .brand { width: 58mm; display: flex; align-items: center; gap: 5px; padding: 6px 8px; }
  .brand .nfs { font-size: 25px; font-weight: 800; font-style: italic; color: #17549b; letter-spacing: -1px; }
  .brand .nfs .e { color: #47a23f; font-size: 27px; }
  .brand .sub { font-size: 8px; color: #666; line-height: 1.2; }
  .brand .sub b { color: #47a23f; font-weight: 600; }
  .cab .mid { flex: 1; text-align: center; }
  .cab .mid .t1 { font-size: 12px; font-weight: 700; }
  .cab .mid .t2 { font-size: 10px; font-weight: 700; }
  .cab .pref { width: 55mm; padding: 4px 8px; font-size: 7.5px; line-height: 1.35; border-left: 1px solid #ccc; }
  .cab .pref b { display: block; font-size: 8.5px; }
  /* Chave + identificação com QR à direita */
  .idwrap { display: flex; border-bottom: 2px solid #000; }
  .idleft { flex: 1; }
  .chave { padding: 3px 8px 1px; }
  .chave .lbl { font-weight: 700; font-size: 8px; display: block; }
  .chave .num { font-size: 9.5px; letter-spacing: .4px; }
  .qrbox { width: 34mm; border-left: 1px solid #ccc; padding: 4px 6px; text-align: center; }
  .qrbox svg { width: 21mm; height: 21mm; }
  .qrbox .cap { font-size: 6.3px; text-align: justify; line-height: 1.25; margin-top: 2px; }
  /* Grid oficial: 4 colunas, sem bordas verticais, linha fina entre linhas */
  .grid { display: flex; border-top: 1px solid #ccc; }
  .grid.first { border-top: 0; }
  .cel { padding: 2px 8px; min-width: 0; overflow: hidden; }
  .lbl { display: block; font-size: 7.2px; font-weight: 700; }
  .val { display: block; font-size: 8.2px; word-wrap: break-word; }
  .sec-in { display: block; font-size: 8.2px; font-weight: 800; text-transform: uppercase; }
  /* Títulos de seção de linha inteira */
  .sec { border-top: 2px solid #000; padding: 2px 8px 0; font-size: 8.2px; font-weight: 800; text-transform: uppercase; }
  .sec-mid { border-top: 2px solid #000; border-bottom: 0; padding: 2px 8px; font-size: 8px; font-weight: 800; text-transform: uppercase; text-align: center; }
  .liq b { font-size: 9.5px; }
  .homolog { text-align: center; font-weight: 800; border: 2px solid #000; padding: 3px; margin: 4px 8px; letter-spacing: 1px; font-size: 9px; }
  .logo-emit { max-height: 26px; max-width: 80px; float: right; margin: 2px 6px 0 0; }
  .totais { display: flex; text-align: center; }
  .totais .cel { flex: 1; }
  .toolbar { text-align: center; padding: 10px; background: #fff; border-bottom: 1px solid #ddd; }
  .toolbar button { font-size: 13px; font-weight: 700; padding: 8px 18px; cursor: pointer; border: 0; border-radius: 5px; background: #17549b; color: #fff; }
  .toolbar .hint { display: block; font-size: 10px; color: #555; margin-top: 5px; }
  @media print { body { background: #fff; } .no-print { display: none !important; } .doc { border: 1px solid #777; width: auto; } @page { size: A4 portrait; margin: 6mm; } }
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
      <span class="nfs">NFS<span class="e">e</span></span>
      <span class="sub">Nota Fiscal de<br/>Serviço <b>eletrônica</b></span>
    </div>
    <div class="mid">
      <div class="t1">DANFSe v1.0</div>
      <div class="t2">Documento Auxiliar da NFS-e</div>
    </div>
    <div class="pref">
      <b>Prefeitura Municipal de ${escHtml(d.xLocIncid || d.xLocEmi || d.emit.mun || "")}</b>
      Documento emitido pelo Sistema Nacional NFS-e<br/>www.nfse.gov.br
    </div>
  </div>
  ${homolog}

  <div class="idwrap">
    <div class="idleft">
      <div class="chave">
        <span class="lbl">Chave de Acesso da NFS-e</span>
        <span class="num">${escHtml(d.chave)}</span>
      </div>
      <div class="grid">
        ${cel("Número da NFS-e", d.nNFSe)}
        ${cel("Competência da NFS-e", dataFmt(d.dCompet))}
        ${cel("Data e Hora da emissão da NFS-e", dhFmt(d.dhProc || d.dhEmi), 1.4)}
      </div>
      <div class="grid">
        ${cel("Número da DPS", d.nDPS)}
        ${cel("Série da DPS", d.serie)}
        ${cel("Data e Hora da emissão da DPS", dhFmt(d.dhEmi), 1.4)}
      </div>
    </div>
    <div class="qrbox">
      ${qrCodeSvg(consultaPublicaNfseUrl(d.chave))}
      <div class="cap">A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e.</div>
    </div>
  </div>

  <div class="grid first" style="border-top:0">
    ${celSecao("EMITENTE DA NFS-e", "Prestador do Serviço", 1.2)}
    ${cel("CNPJ / CPF / NIF", docFmt(d.emit.doc))}
    ${cel("Inscrição Municipal", d.emit.im || "-")}
    ${cel("Telefone", foneFmt(d.emit.fone))}
  </div>
  <div class="grid">
    ${cel("Nome / Nome Empresarial", d.emit.nome, 2.2)}
    ${cel("E-mail", d.emit.email || "-", 1.8)}
  </div>
  <div class="grid">
    ${cel("Endereço", d.emit.log || "-", 2.2)}
    ${cel("Município", d.emit.mun || "-")}
    ${cel("CEP", cepFmt(d.emit.cep))}
  </div>
  <div class="grid">
    ${cel("Simples Nacional na Data de Competência", simpNacLabel(d.simpNac), 2.2)}
    ${cel("Regime de Apuração Tributária pelo SN", d.regApSN || "-", 1.8)}
  </div>

  <div class="grid" style="border-top:2px solid #000">
    ${celSecao("TOMADOR DO SERVIÇO", "", 1.2)}
    ${cel("CNPJ / CPF / NIF", d.toma.doc ? docFmt(d.toma.doc) : "-")}
    ${cel("Inscrição Municipal", d.toma.im || "-")}
    ${cel("Telefone", d.toma.fone ? foneFmt(d.toma.fone) : "-")}
  </div>
  <div class="grid">
    ${cel("Nome / Nome Empresarial", d.toma.nome || "-", 2.2)}
    ${cel("E-mail", d.toma.email || "-", 1.8)}
  </div>
  <div class="grid">
    ${cel("Endereço", d.toma.log || "-", 2.2)}
    ${cel("Município", d.toma.mun || "-")}
    ${cel("CEP", cepFmt(d.toma.cep))}
  </div>

  ${d.interm
    ? `<div class="grid" style="border-top:2px solid #000">
        ${celSecao("INTERMEDIÁRIO DO SERVIÇO", "", 1.2)}
        ${cel("CNPJ / CPF / NIF", d.interm.doc ? docFmt(d.interm.doc) : "-")}
        ${cel("Nome / Nome Empresarial", d.interm.nome || "-", 2)}
      </div>`
    : `<div class="sec-mid">INTERMEDIÁRIO DO SERVIÇO NÃO IDENTIFICADO NA NFS-e</div>`}

  <div class="sec">SERVIÇO PRESTADO</div>
  <div class="grid first">
    ${cel("Código de Tributação Nacional", cTribNacFmt, 1.4)}
    ${cel("Código de Tributação Municipal", d.serv.cTribMun || "-")}
    ${cel("Local da Prestação", d.xLocPrestacao || "-")}
    ${cel("País da Prestação", "-")}
  </div>
  <div class="grid">
    ${cel("Descrição do Serviço", d.serv.xDescServ, 1)}
  </div>

  <div class="sec">TRIBUTAÇÃO MUNICIPAL</div>
  <div class="grid first">
    ${cel("Tributação do ISSQN", tribISSQNLabel(d.tribISSQN))}
    ${cel("País Resultado da Prestação do Serviço", "-")}
    ${cel("Município de Incidência do ISSQN", d.xLocIncid || d.xLocPrestacao || "-")}
    ${cel("Regime Especial de Tributação", "Nenhum")}
  </div>
  <div class="grid">
    ${cel("Tipo de Imunidade", "-")}
    ${cel("Suspensão da Exigibilidade do ISSQN", "Não")}
    ${cel("Número Processo Suspensão", "-")}
    ${cel("Benefício Municipal", "-")}
  </div>
  <div class="grid">
    ${cel("Valor do Serviço", mon(v.vServ, true))}
    ${cel("Desconto Incondicionado", mon(v.vDescIncond))}
    ${cel("Total Deduções/Reduções", mon(v.vDedRed))}
    ${cel("Cálculo do BM", "-")}
  </div>
  <div class="grid">
    ${cel("BC ISSQN", mon(v.vBC, true))}
    ${cel("Alíquota Aplicada", Number(v.pAliq) > 0 ? `${brl(v.pAliq)} %` : "-")}
    ${cel("Retenção do ISSQN", retISSQNLabel(d.tpRetISSQN))}
    ${cel("ISSQN Apurado", mon(v.vISSQN))}
  </div>

  <div class="sec">TRIBUTAÇÃO FEDERAL</div>
  <div class="grid first">
    ${cel("IRRF", mon(v.vRetIRRF))}
    ${cel("Contribuição Previdenciária - Retida", mon(v.vRetINSS))}
    ${cel("Contribuições Sociais - Retidas", mon(Number(v.vRetCSLL) > 0 ? v.vRetCSLL : ""))}
    ${cel("Descrição Contrib. Sociais - Retidas", Number(v.vRetCSLL) > 0 ? "CSLL" : "-")}
  </div>
  <div class="grid">
    ${cel("PIS - Débito Apuração Própria", mon(v.vRetPis))}
    ${cel("COFINS - Débito Apuração Própria", mon(v.vRetCofins), 3)}
  </div>

  <div class="sec">VALOR TOTAL DA NFS-e</div>
  <div class="grid first">
    ${cel("Valor do Serviço", mon(v.vServ, true))}
    ${cel("Desconto Condicionado", mon(v.vDescCond))}
    ${cel("Desconto Incondicionado", mon(v.vDescIncond))}
    ${cel("ISSQN Retido", issRetido ? mon(v.vISSQN, true) : "-")}
  </div>
  <div class="grid liq">
    ${cel("Total das Retenções Federais", mon(v.vTotalRet))}
    ${cel("PIS/COFINS - Débito Apur. Própria", "-")}
    <div class="cel" style="flex:1"><span class="lbl">Valor Líquido da NFS-e</span><span class="val"><b>${escHtml(mon(v.vLiq, true))}</b></span></div>
  </div>

  <div class="sec">TOTAIS APROXIMADOS DOS TRIBUTOS</div>
  <div class="grid first totais">
    ${cel("Federais", mon(v.totFed))}
    ${cel("Estaduais", mon(v.totEst))}
    ${cel("Municipais", mon(v.totMun))}
  </div>

  <div class="sec">INFORMAÇÕES COMPLEMENTARES</div>
  <div class="grid first">
    <div class="cel" style="flex:1"><span class="val">${escHtml(infComp) || "-"}${logoEmit}</span></div>
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

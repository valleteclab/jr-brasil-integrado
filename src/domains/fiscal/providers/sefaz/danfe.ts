/**
 * DANFE (Documento Auxiliar da Nota Fiscal Eletrônica) — representação gráfica da NF-e modelo 55.
 *
 * Gera o DANFE a partir do XML `nfeProc` AUTORIZADO (NF-e + protNFe). A SEFAZ não devolve PDF: o
 * DANFE é responsabilidade do emitente (ver docs/provider-sefaz-nfe-design.md §6). Layout retrato
 * A4 simplificado, porém legível, com a CHAVE DE ACESSO (44) em Code-128C.
 *
 * Abordagem: NÃO há lib de PDF no projeto (só `fast-xml-parser`). Para manter F4 dependency-free,
 * geramos um DANFE em HTML autocontido (CSS inline para A4) + código de barras Code-128C como SVG
 * inline. A conversão para PDF de verdade (layout fiel, fonte fixa de impressão) pode ser feita
 * depois adicionando uma lib (ex.: `puppeteer`/`playwright` para renderizar este HTML, ou `pdfkit`/
 * `@react-pdf/renderer` para desenhar). Quando essa lib existir, basta um novo branch aqui que
 * reaproveita os campos já parseados (`parseNfeProc`) e a codificação Code-128 (`code128cBars`).
 *
 * Reuso: segue o mesmo padrão de parsing simples por regex de `soap.ts` (pickTag/pickBlock). Como
 * o DANFE precisa de campos repetidos (det[]) e atributos (Id da chave, nItem), implementamos
 * helpers locais mais ricos aqui, sem editar `soap.ts`.
 */
import QRCode from "qrcode";

const onlyDigits = (s: string | number | null | undefined) => String(s ?? "").replace(/\D/g, "");

/** Escapa texto para inserir com segurança em HTML. */
const escHtml = (s: string | number | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// --------------------------------------------------------------------------------------------------
// Parsing simples do nfeProc (mesma filosofia de soap.ts: regex, ignora prefixo de namespace).
// --------------------------------------------------------------------------------------------------

/** Texto da PRIMEIRA ocorrência de uma tag dentro de `xml` (sem prefixo). Vazio se ausente. */
function pick(xml: string, tag: string): string {
  const m = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`).exec(xml);
  return m?.[1]?.trim() ?? "";
}

/** Elemento INTEIRO (com tags) da PRIMEIRA ocorrência. Vazio se ausente. */
function pickBlock(xml: string, tag: string): string {
  const m = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>[\\s\\S]*?</(?:\\w+:)?${tag}>`).exec(xml);
  return m?.[0] ?? "";
}

/** TODAS as ocorrências (conteúdo interno) de uma tag — usado para os itens `det`. */
function pickAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

/** Documento (CNPJ ou CPF) com rótulo, a partir de um bloco emit/dest. */
function pickDoc(block: string): { label: string; value: string } {
  const cnpj = pick(block, "CNPJ");
  if (cnpj) return { label: "CNPJ", value: cnpj };
  const cpf = pick(block, "CPF");
  if (cpf) return { label: "CPF", value: cpf };
  return { label: "CNPJ/CPF", value: "" };
}

/** Formata valor monetário pt-BR (string numérica "1234.56" → "1.234,56"). Vazio → "0,00". */
function brl(v: string | number | null | undefined): string {
  const n = Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return "0,00";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Quantidade pt-BR (até 4 casas, sem zeros desnecessários além da 4ª). */
function qtd(v: string | number | null | undefined): string {
  const n = Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

/** Chave em grupos de 4 dígitos (legibilidade humana). */
function chaveFormatada(chave: string): string {
  return (chave.match(/.{1,4}/g) ?? []).join(" ");
}

/** CNPJ/CPF formatado para exibição. */
function docFmt(label: string, value: string): string {
  const d = onlyDigits(value);
  if (label === "CNPJ" && d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  if (label === "CPF" && d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  return value;
}

/** Data/hora ISO da NF-e (dhEmi) → "dd/mm/aaaa hh:mm". Mantém o texto cru se não casar. */
function dhFmt(dh: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(dh);
  if (!m) return dh;
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
}

export type DanfeItem = {
  nItem: string;
  cProd: string;
  xProd: string;
  ncm: string;
  cfop: string;
  uCom: string;
  qCom: string;
  vUnCom: string;
  vProd: string;
};

export type DanfeData = {
  chave: string;          // 44 dígitos (do atributo Id="NFe...")
  nNF: string;
  serie: string;
  natOp: string;
  dhEmi: string;
  tpNF: string;           // 0=entrada, 1=saída
  tpAmb: string;          // 1=produção, 2=homologação
  protocolo: string;      // nProt
  dhProt: string;         // dhRecbto do protNFe
  emit: { nome: string; fantasia: string; doc: { label: string; value: string }; ie: string; ender: string };
  dest: { nome: string; doc: { label: string; value: string }; ie: string; ender: string };
  itens: DanfeItem[];
  totais: {
    vProd: string; vNF: string; vICMS: string; vBC: string; vDesc: string;
    vFrete: string; vSeg: string; vOutro: string; vST: string; vBCST: string; vPIS: string; vCOFINS: string;
  };
  infCpl: string;
};

/** Monta um endereço de uma linha a partir de um bloco enderEmit/enderDest. */
function enderecoLinha(end: string): string {
  if (!end) return "";
  const partes = [
    pick(end, "xLgr"),
    pick(end, "nro") ? `nº ${pick(end, "nro")}` : "",
    pick(end, "xCpl"),
    pick(end, "xBairro"),
    [pick(end, "xMun"), pick(end, "UF")].filter(Boolean).join("/"),
    pick(end, "CEP") ? `CEP ${pick(end, "CEP")}` : "",
  ].filter(Boolean);
  return partes.join(" - ");
}

/**
 * Parser do nfeProc → campos do DANFE. Fallback seguro (string vazia) para campos ausentes;
 * não cobre 100% do schema, apenas o necessário para a representação gráfica.
 */
export function parseNfeProc(nfeProcXml: string): DanfeData {
  const xml = nfeProcXml ?? "";

  // Chave: atributo Id="NFe<44 dígitos>" do infNFe (fonte canônica). Fallback: tags da chave.
  const idMatch = /Id\s*=\s*"NFe(\d{44})"/.exec(xml);
  const chave = idMatch?.[1] ?? onlyDigits(pick(xml, "chNFe")).slice(0, 44);

  const ide = pickBlock(xml, "ide");
  const emitBlock = pickBlock(xml, "emit");
  const destBlock = pickBlock(xml, "dest");
  const totalBlock = pickBlock(xml, "ICMSTot");
  const protBlock = pickBlock(xml, "protNFe") || pickBlock(xml, "infProt");

  const emitEnder = pickBlock(emitBlock, "enderEmit");
  const destEnder = pickBlock(destBlock, "enderDest");

  // Itens: usamos o índice 1-based como nItem (a ordem do det no XML é a ordem dos itens). Não
  // dependemos do atributo nItem do <det> porque pickAll captura só o conteúdo interno.
  const itens: DanfeItem[] = pickAll(xml, "det").map((det, i) => {
    const prod = pickBlock(det, "prod");
    return {
      nItem: String(i + 1),
      cProd: pick(prod, "cProd"),
      xProd: pick(prod, "xProd"),
      ncm: pick(prod, "NCM"),
      cfop: pick(prod, "CFOP"),
      uCom: pick(prod, "uCom"),
      qCom: pick(prod, "qCom"),
      vUnCom: pick(prod, "vUnCom"),
      vProd: pick(prod, "vProd"),
    };
  });

  return {
    chave,
    nNF: pick(ide, "nNF"),
    serie: pick(ide, "serie"),
    natOp: pick(ide, "natOp"),
    dhEmi: pick(ide, "dhEmi"),
    tpNF: pick(ide, "tpNF"),
    tpAmb: pick(ide, "tpAmb"),
    protocolo: pick(protBlock, "nProt"),
    dhProt: pick(protBlock, "dhRecbto"),
    emit: {
      nome: pick(emitBlock, "xNome"),
      fantasia: pick(emitBlock, "xFant"),
      doc: pickDoc(emitBlock),
      ie: pick(emitBlock, "IE"),
      ender: enderecoLinha(emitEnder),
    },
    dest: {
      nome: pick(destBlock, "xNome"),
      doc: pickDoc(destBlock),
      ie: pick(destBlock, "IE"),
      ender: enderecoLinha(destEnder),
    },
    itens,
    totais: {
      vProd: pick(totalBlock, "vProd"),
      vNF: pick(totalBlock, "vNF"),
      vICMS: pick(totalBlock, "vICMS"),
      vBC: pick(totalBlock, "vBC"),
      vDesc: pick(totalBlock, "vDesc"),
      vFrete: pick(totalBlock, "vFrete"),
      vSeg: pick(totalBlock, "vSeg"),
      vOutro: pick(totalBlock, "vOutro"),
      vST: pick(totalBlock, "vST"),
      vBCST: pick(totalBlock, "vBCST"),
      vPIS: pick(totalBlock, "vPIS"),
      vCOFINS: pick(totalBlock, "vCOFINS"),
    },
    infCpl: pick(pickBlock(xml, "infAdic"), "infCpl"),
  };
}

// --------------------------------------------------------------------------------------------------
// Code-128C (dependency-free) — codifica os 44 dígitos da chave em SVG inline.
//
// Code-128C codifica PARES de dígitos: cada par 00..99 vira o valor 0..99 da tabela. A chave tem
// 44 dígitos (par), ideal para C puro: start C (105) + 22 pares + checksum + stop (106).
//
// Checksum (módulo 103): soma = valor(start) + Σ valor(i) * posição(i), começando a posição em 1
// para o PRIMEIRO dado; checksum = soma % 103.
//
// Validação mental do checksum (exemplo do manual Code-128, dado "CODE128" em mix de tabelas)
// confirma a fórmula soma = startVal + Σ (dataVal_i * i); aqui aplicamos a mesma fórmula com start
// = 105. Para a chave numérica em C puro: posições 1..22 são os pares; o stop NÃO entra na soma.
//
// Larguras de barra: cada símbolo Code-128 são 6 elementos (barra/espaço alternados) cujas larguras
// somam 11 módulos. A tabela abaixo (índice 0..106) traz o padrão de cada símbolo como string de 6
// dígitos de largura. Símbolos 0..102 + 103/104/105 (starts A/B/C) + 106 (stop, 7 elementos / 13
// módulos: "2331112"). Renderizamos como retângulos pretos (barras nas posições pares do padrão).
// --------------------------------------------------------------------------------------------------

/** Larguras dos 6 elementos de cada símbolo Code-128 (107 entradas: 0..106). Stop tem 7 elementos. */
const CODE128_PATTERNS: string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232",
  "2331112", // 106 = STOP
];

const CODE128_START_C = 105;
const CODE128_STOP = 106;

/**
 * Code-128C da chave (44 dígitos) → lista de larguras de barras/espaços (em módulos), na ordem
 * barra, espaço, barra, ... começando por barra. Inclui quiet zone implícito? Não: a quiet zone é
 * adicionada pelo SVG (margem). Retorna também a sequência de valores para auditoria/teste.
 */
export function code128cValues(chave44: string): { values: number[]; checksum: number } {
  const d = onlyDigits(chave44);
  // Garante 44 dígitos (par). Se vier curto/ímpar, faz padding à esquerda com zeros até 44.
  const norm = d.length === 44 ? d : d.padStart(44, "0").slice(-44);

  const values: number[] = [CODE128_START_C];
  for (let i = 0; i < norm.length; i += 2) {
    values.push(Number(norm.slice(i, i + 2)));
  }

  // Checksum módulo 103: start (peso implícito 1) + cada dado * posição (1-based).
  let soma = CODE128_START_C;
  for (let i = 1; i < values.length; i++) {
    soma += values[i] * i;
  }
  const checksum = soma % 103;

  return { values: [...values, checksum, CODE128_STOP], checksum };
}

/** Renderiza a chave como código de barras Code-128C em SVG inline (preto/branco, altura fixa). */
export function code128cBars(chave44: string, opts?: { height?: number; module?: number }): string {
  const height = opts?.height ?? 56;
  const mod = opts?.module ?? 1.6; // largura de 1 módulo em px
  const quiet = 10 * mod;          // quiet zone de 10 módulos (recomendação)
  const { values } = code128cValues(chave44);

  // Concatena os padrões de todos os símbolos (cada padrão alterna barra/espaço começando por barra).
  let x = quiet;
  let bars = "";
  let totalModules = 0;
  for (const v of values) {
    const pattern = CODE128_PATTERNS[v] ?? "";
    let isBar = true;
    for (const ch of pattern) {
      const w = Number(ch) * mod;
      if (isBar) {
        bars += `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}" fill="#000"/>`;
      }
      x += w;
      totalModules += Number(ch);
      isBar = !isBar;
    }
  }
  const width = quiet * 2 + totalModules * mod;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(0)}" height="${height}" ` +
    `viewBox="0 0 ${width.toFixed(2)} ${height}" preserveAspectRatio="xMidYMid meet" ` +
    `shape-rendering="crispEdges" role="img" aria-label="Codigo de barras Code-128 da chave de acesso">` +
    `<rect x="0" y="0" width="${width.toFixed(2)}" height="${height}" fill="#fff"/>${bars}</svg>`
  );
}

// --------------------------------------------------------------------------------------------------
// QR Code de consulta — leva à CONSULTA da NF-e no portal NACIONAL pela chave de acesso.
// --------------------------------------------------------------------------------------------------

/**
 * URL de consulta da NF-e (modelo 55) no portal NACIONAL pela chave de acesso. Não depende de
 * `infNFeSupl/qrCode` no XML (que nossa emissão não gera): monta a partir da chave + ambiente.
 */
export function consultaNfeNacionalUrl(chave: string, tpAmb: string): string {
  const amb = tpAmb === "2" ? "2" : "1";
  return `https://www.nfe.fazenda.gov.br/portal/consultaResumo.aspx?chNFe=${onlyDigits(chave)}&tpAmb=${amb}`;
}

/**
 * QR Code como SVG inline (sem <img>/base64), no mesmo espírito do Code-128 desenhado à mão.
 * Usa a API SÍNCRONA `QRCode.create` (matriz de módulos) e desenha um <rect> por módulo escuro,
 * com zona de silêncio (margin) de 2 módulos. Mantém `buildDanfe`/`renderHtml` síncronos.
 */
export function qrCodeSvg(text: string, displayPx = 96): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const bits = qr.modules.data;
  const margin = 2;
  const dim = n + margin * 2;
  let rects = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (bits[y * n + x]) rects += `<rect x="${x + margin}" y="${y + margin}" width="1" height="1"/>`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${displayPx}" height="${displayPx}" ` +
    `viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" aria-label="QR Code de consulta da NF-e">` +
    `<rect width="${dim}" height="${dim}" fill="#fff"/><g fill="#000">${rects}</g></svg>`
  );
}

// --------------------------------------------------------------------------------------------------
// Montagem do HTML do DANFE (A4 retrato, CSS inline para impressão).
// --------------------------------------------------------------------------------------------------

function boxLabel(label: string, value: string): string {
  return `<div class="cell"><span class="lbl">${escHtml(label)}</span><span class="val">${escHtml(value) || "&nbsp;"}</span></div>`;
}

function renderHtml(d: DanfeData): string {
  const tipo = d.tpNF === "0" ? "0 - ENTRADA" : "1 - SAÍDA";
  const homolog =
    d.tpAmb === "2"
      ? `<div class="homolog">AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL</div>`
      : "";

  const itensRows = d.itens
    .map(
      (it) => `
      <tr>
        <td class="c">${escHtml(it.nItem)}</td>
        <td>${escHtml(it.cProd)}</td>
        <td>${escHtml(it.xProd)}</td>
        <td class="c">${escHtml(it.ncm)}</td>
        <td class="c">${escHtml(it.cfop)}</td>
        <td class="c">${escHtml(it.uCom)}</td>
        <td class="r">${escHtml(qtd(it.qCom))}</td>
        <td class="r">${escHtml(brl(it.vUnCom))}</td>
        <td class="r">${escHtml(brl(it.vProd))}</td>
      </tr>`
    )
    .join("");

  const t = d.totais;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>DANFE ${escHtml(d.nNF)} - ${escHtml(d.chave)}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: A4 portrait; margin: 8mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9px; color: #000; margin: 0; }
  .danfe { width: 194mm; margin: 0 auto; }
  .box { border: 1px solid #000; }
  .row { display: flex; }
  .cell { border: 1px solid #000; padding: 2px 4px; flex: 1; overflow: hidden; }
  .lbl { display: block; font-size: 7px; color: #333; text-transform: uppercase; }
  .val { display: block; font-size: 10px; font-weight: bold; }
  .title { text-align: center; font-weight: bold; }
  .header { display: flex; align-items: stretch; }
  .header .emit { flex: 2; padding: 4px; border: 1px solid #000; }
  .header .danfe-id { flex: 1; padding: 4px; border: 1px solid #000; text-align: center; }
  .header .barcode { flex: 2; padding: 4px; border: 1px solid #000; text-align: center; }
  .emit .nome { font-size: 13px; font-weight: bold; }
  .danfe-id .big { font-size: 18px; font-weight: bold; }
  .danfe-id .tipo { display: inline-block; border: 1px solid #000; width: 22px; text-align: center; font-weight: bold; margin: 2px; }
  .barcode .chave { font-family: "Courier New", monospace; font-size: 9px; word-spacing: 2px; margin-top: 3px; }
  table.itens { width: 100%; border-collapse: collapse; margin-top: 4px; }
  table.itens th, table.itens td { border: 1px solid #000; padding: 2px 3px; font-size: 8px; }
  table.itens th { background: #eee; text-transform: uppercase; }
  td.c, th.c { text-align: center; }
  td.r, th.r { text-align: right; }
  .secao { font-weight: bold; background: #eee; border: 1px solid #000; padding: 1px 4px; margin-top: 4px; text-transform: uppercase; }
  .homolog { text-align: center; color: #b00; font-weight: bold; border: 2px solid #b00; padding: 4px; margin: 4px 0; letter-spacing: 1px; }
  .note { font-size: 7px; color: #555; margin-top: 6px; text-align: center; }
  .barcode .qr { margin-top: 4px; }
  .barcode .qr svg { width: 96px; height: 96px; }
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
<div class="danfe">
  ${homolog}

  <div class="header">
    <div class="emit">
      <div class="title">RECEBEMOS DE ${escHtml(d.emit.nome)} OS PRODUTOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA AO LADO</div>
      <div class="nome" style="margin-top:6px">${escHtml(d.emit.nome)}</div>
      <div>${escHtml(d.emit.fantasia)}</div>
      <div>${escHtml(d.emit.ender)}</div>
      <div>${escHtml(d.emit.doc.label)}: ${escHtml(docFmt(d.emit.doc.label, d.emit.doc.value))} &nbsp; IE: ${escHtml(d.emit.ie)}</div>
    </div>
    <div class="danfe-id">
      <div class="big">DANFE</div>
      <div>Documento Auxiliar da NF-e</div>
      <div style="margin-top:4px">
        <span class="tipo">${escHtml(d.tpNF === "0" ? "0" : "1")}</span>
        <span style="font-size:7px">${escHtml(tipo)}</span>
      </div>
      <div style="margin-top:4px"><strong>Nº</strong> ${escHtml(d.nNF.padStart(9, "0"))}</div>
      <div><strong>SÉRIE</strong> ${escHtml(d.serie)}</div>
      <div><strong>MODELO</strong> 55</div>
    </div>
    <div class="barcode">
      <div style="font-size:7px">CHAVE DE ACESSO</div>
      ${code128cBars(d.chave)}
      <div class="chave">${escHtml(chaveFormatada(d.chave))}</div>
      <div class="qr">${qrCodeSvg(consultaNfeNacionalUrl(d.chave, d.tpAmb))}</div>
      <div style="font-size:7px;margin-top:2px">Consulte esta NF-e pela chave de acesso no<br/>portal nacional — www.nfe.fazenda.gov.br/portal</div>
    </div>
  </div>

  <div class="row">
    ${boxLabel("NATUREZA DA OPERAÇÃO", d.natOp)}
    ${boxLabel("PROTOCOLO DE AUTORIZAÇÃO DE USO", [d.protocolo, dhFmt(d.dhProt)].filter(Boolean).join(" - "))}
  </div>
  <div class="row">
    ${boxLabel("DATA DE EMISSÃO", dhFmt(d.dhEmi))}
    ${boxLabel("INSCRIÇÃO ESTADUAL (EMITENTE)", d.emit.ie)}
  </div>

  <div class="secao">Destinatário / Remetente</div>
  <div class="row">
    ${boxLabel("NOME / RAZÃO SOCIAL", d.dest.nome)}
    ${boxLabel(d.dest.doc.label, docFmt(d.dest.doc.label, d.dest.doc.value))}
    ${boxLabel("INSCRIÇÃO ESTADUAL", d.dest.ie)}
  </div>
  <div class="row">
    ${boxLabel("ENDEREÇO", d.dest.ender)}
  </div>

  <div class="secao">Dados dos Produtos / Serviços</div>
  <table class="itens">
    <thead>
      <tr>
        <th class="c">Item</th>
        <th>Código</th>
        <th>Descrição</th>
        <th class="c">NCM</th>
        <th class="c">CFOP</th>
        <th class="c">Un</th>
        <th class="r">Qtd</th>
        <th class="r">Vl. Unit.</th>
        <th class="r">Vl. Total</th>
      </tr>
    </thead>
    <tbody>
      ${itensRows || `<tr><td colspan="9" class="c">Sem itens</td></tr>`}
    </tbody>
  </table>

  <div class="secao">Cálculo do Imposto</div>
  <div class="row">
    ${boxLabel("BASE DE CÁLCULO ICMS", brl(t.vBC))}
    ${boxLabel("VALOR DO ICMS", brl(t.vICMS))}
    ${boxLabel("BASE CÁLCULO ICMS ST", brl(t.vBCST))}
    ${boxLabel("VALOR DO ICMS ST", brl(t.vST))}
    ${boxLabel("VALOR TOTAL DOS PRODUTOS", brl(t.vProd))}
  </div>
  <div class="row">
    ${boxLabel("VALOR DO FRETE", brl(t.vFrete))}
    ${boxLabel("VALOR DO SEGURO", brl(t.vSeg))}
    ${boxLabel("DESCONTO", brl(t.vDesc))}
    ${boxLabel("OUTRAS DESPESAS", brl(t.vOutro))}
    ${boxLabel("VALOR TOTAL DA NOTA", brl(t.vNF))}
  </div>
  <div class="row">
    ${boxLabel("VALOR DO PIS", brl(t.vPIS))}
    ${boxLabel("VALOR DA COFINS", brl(t.vCOFINS))}
  </div>

  ${
    d.infCpl
      ? `<div class="secao">Dados Adicionais</div><div class="cell"><span class="val" style="font-weight:normal">${escHtml(d.infCpl)}</span></div>`
      : ""
  }

  <div class="note">
    DANFE gerado pela plataforma a partir do XML autorizado (nfeProc). Para PDF, use
    "Imprimir &rarr; Salvar como PDF" no navegador.
  </div>
</div>
</body>
</html>`;
}

/**
 * Gera o DANFE a partir do XML `nfeProc` autorizado.
 *
 * Retorno pronto para `downloadDocument` do provider repassar ao cliente: o chamador embrulha em
 * `{ ok: true, ...buildDanfe(xml) }`. Como não há lib de PDF, devolve HTML printable (text/html);
 * quando uma lib de PDF for adicionada, este retorno passa a "application/pdf" sem mudar a assinatura.
 *
 * @param nfeProcXml XML do `nfeProc` (NF-e modelo 55 + protNFe) autorizado.
 */
export function buildDanfe(nfeProcXml: string): { contentType: string; body: Buffer; filename: string } {
  const data = parseNfeProc(nfeProcXml);
  const html = renderHtml(data);
  const filename = `DANFE-${data.chave || "nfe"}.html`;
  return {
    contentType: "text/html; charset=utf-8",
    body: Buffer.from(html, "utf8"),
    filename,
  };
}

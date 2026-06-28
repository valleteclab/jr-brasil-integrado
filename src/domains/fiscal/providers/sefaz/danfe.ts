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
import { qrCodeSvg } from "../_shared/qrcode-svg";

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
  cstOrig: string;        // CST/CSOSN com origem (ex.: "0 00" / "0 102")
  cfop: string;
  uCom: string;
  qCom: string;
  vUnCom: string;
  vProd: string;
  vBcIcms: string;
  vIcms: string;
  aliqIcms: string;
};

export type DanfeEndereco = { lgr: string; nro: string; cpl: string; bairro: string; mun: string; uf: string; cep: string; fone: string };
export type DanfeParte = { nome: string; fantasia: string; doc: { label: string; value: string }; ie: string; end: DanfeEndereco; email: string };

export type DanfeData = {
  chave: string;          // 44 dígitos (do atributo Id="NFe...")
  nNF: string;
  serie: string;
  natOp: string;
  dhEmi: string;
  dhSaiEnt: string;
  tpNF: string;           // 0=entrada, 1=saída
  tpAmb: string;          // 1=produção, 2=homologação
  protocolo: string;      // nProt
  dhProt: string;         // dhRecbto do protNFe
  emit: DanfeParte;
  dest: DanfeParte;
  transp: { modFrete: string; nome: string; doc: string; ie: string; end: string; placa: string; ufVeic: string; qVol: string; esp: string; pesoL: string; pesoB: string };
  itens: DanfeItem[];
  totais: {
    vProd: string; vNF: string; vICMS: string; vBC: string; vDesc: string; vFrete: string; vSeg: string;
    vOutro: string; vST: string; vBCST: string; vPIS: string; vCOFINS: string; vIPI: string; vTotTrib: string;
  };
  /** Reforma Tributária (IBS/CBS/IS) — presente quando o XML traz IBSCBSTot. Null quando ausente. */
  reforma: { vBC: string; vIBS: string; vIBSUF: string; vIBSMun: string; vCBS: string; vIS: string } | null;
  infCpl: string;
  infFisco: string;
};

const cepFmt = (v: string) => { const d = onlyDigits(v); return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : v; };
const foneFmt = (v: string) => {
  const d = onlyDigits(v);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v;
};

/** Extrai os campos de um bloco de endereço (enderEmit/enderDest). */
function parseEndereco(end: string): DanfeEndereco {
  return {
    lgr: pick(end, "xLgr"), nro: pick(end, "nro"), cpl: pick(end, "xCpl"), bairro: pick(end, "xBairro"),
    mun: pick(end, "xMun"), uf: pick(end, "UF"), cep: pick(end, "CEP"), fone: pick(end, "fone")
  };
}

/** Endereço em uma linha (logradouro, nº, complemento, bairro). */
function enderecoLinha(e: DanfeEndereco): string {
  return [e.lgr, e.nro ? `nº ${e.nro}` : "", e.cpl, e.bairro].filter(Boolean).join(", ");
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
  const ibsCbsTotBlock = pickBlock(xml, "IBSCBSTot");
  const isTotBlock = pickBlock(xml, "ISTot");
  const protBlock = pickBlock(xml, "protNFe") || pickBlock(xml, "infProt");

  const emitEnder = pickBlock(emitBlock, "enderEmit");
  const destEnder = pickBlock(destBlock, "enderDest");

  const transpBlock = pickBlock(xml, "transp");
  const veic = pickBlock(transpBlock, "veicTransp");
  const vol = pickBlock(transpBlock, "vol");
  const transporta = pickBlock(transpBlock, "transporta");

  // Itens: usamos o índice 1-based como nItem (a ordem do det no XML é a ordem dos itens). O ICMS
  // de cada item está em um subgrupo (ICMS00/ICMS10/ICMSSN.../etc.) — pegamos os campos comuns.
  const itens: DanfeItem[] = pickAll(xml, "det").map((det, i) => {
    const prod = pickBlock(det, "prod");
    const imp = pickBlock(det, "imposto");
    const orig = pick(imp, "orig");
    const cst = pick(imp, "CST") || pick(imp, "CSOSN");
    return {
      nItem: String(i + 1),
      cProd: pick(prod, "cProd"),
      xProd: pick(prod, "xProd"),
      ncm: pick(prod, "NCM"),
      cstOrig: [orig, cst].filter(Boolean).join(" "),
      cfop: pick(prod, "CFOP"),
      uCom: pick(prod, "uCom"),
      qCom: pick(prod, "qCom"),
      vUnCom: pick(prod, "vUnCom"),
      vProd: pick(prod, "vProd"),
      vBcIcms: pick(imp, "vBC"),
      vIcms: pick(imp, "vICMS"),
      aliqIcms: pick(imp, "pICMS"),
    };
  });

  const parte = (block: string, ender: string): DanfeParte => ({
    nome: pick(block, "xNome"), fantasia: pick(block, "xFant"), doc: pickDoc(block),
    ie: pick(block, "IE"), end: parseEndereco(ender), email: pick(block, "email")
  });

  return {
    chave,
    nNF: pick(ide, "nNF"),
    serie: pick(ide, "serie"),
    natOp: pick(ide, "natOp"),
    dhEmi: pick(ide, "dhEmi"),
    dhSaiEnt: pick(ide, "dhSaiEnt"),
    tpNF: pick(ide, "tpNF"),
    tpAmb: pick(ide, "tpAmb"),
    protocolo: pick(protBlock, "nProt"),
    dhProt: pick(protBlock, "dhRecbto"),
    emit: parte(emitBlock, emitEnder),
    dest: parte(destBlock, destEnder),
    transp: {
      modFrete: pick(transpBlock, "modFrete"),
      nome: pick(transporta, "xNome"), doc: pick(transporta, "CNPJ") || pick(transporta, "CPF"),
      ie: pick(transporta, "IE"), end: pick(transporta, "xEnder"),
      placa: pick(veic, "placa"), ufVeic: pick(veic, "UF"),
      qVol: pick(vol, "qVol"), esp: pick(vol, "esp"), pesoL: pick(vol, "pesoL"), pesoB: pick(vol, "pesoB")
    },
    itens,
    totais: {
      vProd: pick(totalBlock, "vProd"), vNF: pick(totalBlock, "vNF"), vICMS: pick(totalBlock, "vICMS"),
      vBC: pick(totalBlock, "vBC"), vDesc: pick(totalBlock, "vDesc"), vFrete: pick(totalBlock, "vFrete"),
      vSeg: pick(totalBlock, "vSeg"), vOutro: pick(totalBlock, "vOutro"), vST: pick(totalBlock, "vST"),
      vBCST: pick(totalBlock, "vBCST"), vPIS: pick(totalBlock, "vPIS"), vCOFINS: pick(totalBlock, "vCOFINS"),
      vIPI: pick(totalBlock, "vIPI"), vTotTrib: pick(totalBlock, "vTotTrib")
    },
    // IBS/CBS: vIBS está no gIBS e vCBS no gCBS (cada um o 1º da sua tag dentro do bloco). IS vem
    // do ISTot (grupo próprio), quando houver. Null se o XML não tiver o totalizador da Reforma.
    reforma: ibsCbsTotBlock
      ? {
          vBC: pick(ibsCbsTotBlock, "vBCIBSCBS"),
          vIBS: pick(pickBlock(ibsCbsTotBlock, "gIBS"), "vIBS"),
          vIBSUF: pick(pickBlock(ibsCbsTotBlock, "gIBSUF"), "vIBSUF"),
          vIBSMun: pick(pickBlock(ibsCbsTotBlock, "gIBSMun"), "vIBSMun"),
          vCBS: pick(pickBlock(ibsCbsTotBlock, "gCBS"), "vCBS"),
          vIS: pick(isTotBlock, "vIS")
        }
      : null,
    infCpl: pick(pickBlock(xml, "infAdic"), "infCpl"),
    infFisco: pick(pickBlock(xml, "infAdic"), "infAdFisco"),
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

// --------------------------------------------------------------------------------------------------
// Montagem do HTML do DANFE (A4 retrato, CSS inline para impressão).
// --------------------------------------------------------------------------------------------------

function cel(label: string, value: string, flex = 1): string {
  return `<div class="cel" style="flex:${flex}"><span class="lbl">${escHtml(label)}</span><span class="val">${escHtml(value) || "&nbsp;"}</span></div>`;
}

const MOD_FRETE: Record<string, string> = {
  "0": "0 - Por conta do emitente", "1": "1 - Por conta do destinatário", "2": "2 - Por conta de terceiros",
  "3": "3 - Próprio (remetente)", "4": "4 - Próprio (destinatário)", "9": "9 - Sem frete"
};

export type DanfeOptions = { logoDataUrl?: string | null };

function renderHtml(d: DanfeData, opts?: DanfeOptions): string {
  const homolog = d.tpAmb === "2" ? `<div class="homolog">AMBIENTE DE HOMOLOGAÇÃO — SEM VALOR FISCAL</div>` : "";
  const logo = opts?.logoDataUrl ? `<img class="logo" src="${escHtml(opts.logoDataUrl)}" alt="logo"/>` : "";
  const t = d.totais;

  // Quadro da Reforma (IBS/CBS/IS) — só quando o XML traz o totalizador (NT 2025.002).
  const r = d.reforma;
  const reformaBloco = r
    ? `<div class="secao">Tributos da Reforma — IBS / CBS / IS (NT 2025.002)</div>
  <div class="row">
    ${cel("Base de cálculo IBS/CBS", brl(r.vBC), 1.5)}
    ${cel("IBS Estadual (UF)", brl(r.vIBSUF))}
    ${cel("IBS Municipal", brl(r.vIBSMun))}
    ${cel("Valor total do IBS", brl(r.vIBS))}
    ${cel("Valor da CBS", brl(r.vCBS))}
    ${cel("Imposto Seletivo (IS)", brl(r.vIS))}
  </div>`
    : "";

  const itensRows = d.itens.map((it) => `
    <tr>
      <td class="c">${escHtml(it.cProd)}</td>
      <td>${escHtml(it.xProd)}</td>
      <td class="c">${escHtml(it.ncm)}</td>
      <td class="c">${escHtml(it.cstOrig)}</td>
      <td class="c">${escHtml(it.cfop)}</td>
      <td class="c">${escHtml(it.uCom)}</td>
      <td class="r">${escHtml(qtd(it.qCom))}</td>
      <td class="r">${escHtml(brl(it.vUnCom))}</td>
      <td class="r">${escHtml(brl(it.vProd))}</td>
      <td class="r">${escHtml(brl(it.vBcIcms))}</td>
      <td class="r">${escHtml(brl(it.vIcms))}</td>
      <td class="r">${escHtml(it.aliqIcms || "0")}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>DANFE ${escHtml(d.nNF)} - ${escHtml(d.chave)}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: A4 portrait; margin: 5mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 8px; color: #000; margin: 0; background: #f5f6f8; }
  .danfe { width: 200mm; margin: 0 auto; background: #fff; padding: 2px; }
  .row { display: flex; }
  .cel { border: 1px solid #000; padding: 1px 4px; flex: 1; overflow: hidden; min-width: 0; }
  .lbl { display: block; font-size: 6px; color: #333; text-transform: uppercase; }
  .val { display: block; font-size: 9px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .val.wrap { white-space: normal; }
  /* Canhoto */
  .canhoto { border: 1px solid #000; display: flex; }
  .canhoto .receb { flex: 3; border-right: 1px solid #000; padding: 2px 4px; }
  .canhoto .data { flex: 1; border-right: 1px solid #000; padding: 2px 4px; }
  .canhoto .ass { flex: 2; border-right: 1px solid #000; padding: 2px 4px; }
  .canhoto .nfe { flex: 1; padding: 2px 4px; text-align: center; font-weight: bold; }
  .canhoto .nfe b { font-size: 12px; }
  .tracejado { border-bottom: 1px dashed #000; margin: 3px 0; }
  /* Cabeçalho */
  .header { display: flex; border: 1px solid #000; margin-top: 1px; }
  .header .emit { flex: 2.2; padding: 4px; border-right: 1px solid #000; display: flex; gap: 6px; align-items: flex-start; }
  .header .emit .logo { max-height: 46px; max-width: 80px; }
  .header .emit .nome { font-size: 12px; font-weight: bold; }
  .header .danfe-id { flex: 1; padding: 4px; border-right: 1px solid #000; text-align: center; }
  .header .danfe-id .big { font-size: 16px; font-weight: bold; }
  .header .danfe-id .tipo { display: inline-flex; gap: 4px; align-items: center; justify-content: center; margin: 2px 0; }
  .header .danfe-id .tipo b { border: 1px solid #000; padding: 0 5px; font-size: 12px; }
  .header .barcode { flex: 2; padding: 4px; text-align: center; }
  .barcode .chave { font-family: "Courier New", monospace; font-size: 8.5px; letter-spacing: .3px; margin-top: 2px; }
  .barcode .qr svg { width: 78px; height: 78px; margin-top: 3px; }
  table.itens { width: 100%; border-collapse: collapse; }
  table.itens th, table.itens td { border: 1px solid #000; padding: 1px 3px; font-size: 7px; }
  table.itens th { background: #e8e8e8; text-transform: uppercase; }
  td.c, th.c { text-align: center; }
  td.r, th.r { text-align: right; }
  .secao { font-weight: bold; background: #ddd; border: 1px solid #000; border-bottom: 0; padding: 0 4px; margin-top: 2px; text-transform: uppercase; font-size: 7px; }
  .homolog { text-align: center; color: #b00; font-weight: bold; border: 2px solid #b00; padding: 3px; margin: 3px 0; letter-spacing: 1px; }
  .danfe > .row > .cel { border-top: 0; }
  .danfe > .row { border: 0; }
  .note { font-size: 6.5px; color: #555; margin-top: 4px; text-align: center; }
  .toolbar { text-align: center; padding: 10px; background: #fff; border-bottom: 1px solid #ddd; }
  .toolbar button { font-size: 13px; font-weight: bold; padding: 8px 18px; cursor: pointer; border: 0; border-radius: 5px; background: #243b53; color: #fff; }
  .toolbar .hint { display: block; font-size: 10px; color: #555; margin-top: 5px; }
  @media print { body { background: #fff; } .no-print { display: none !important; } .danfe { width: auto; } @page { size: A4 portrait; margin: 5mm; } }
</style>
</head>
<body>
<div class="toolbar no-print">
  <button onclick="window.print()">🖨️ Imprimir / Salvar como PDF</button>
  <span class="hint">Na janela de impressão, escolha "Salvar como PDF" como destino.</span>
</div>
<div class="danfe">
  ${homolog}

  <!-- Canhoto -->
  <div class="canhoto">
    <div class="receb"><span class="lbl">Recebemos de ${escHtml(d.emit.nome)} os produtos/serviços constantes da nota fiscal indicada ao lado</span></div>
    <div class="data"><span class="lbl">Data de recebimento</span></div>
    <div class="ass"><span class="lbl">Identificação e assinatura do recebedor</span></div>
    <div class="nfe"><span class="lbl">NF-e</span><b>Nº ${escHtml(d.nNF.padStart(9, "0"))}</b><div>Série ${escHtml(d.serie)}</div></div>
  </div>
  <div class="tracejado"></div>

  <!-- Cabeçalho -->
  <div class="header">
    <div class="emit">
      ${logo}
      <div>
        <div class="nome">${escHtml(d.emit.nome)}</div>
        <div>${escHtml(enderecoLinha(d.emit.end))}</div>
        <div>${escHtml([d.emit.end.mun, d.emit.end.uf].filter(Boolean).join("/"))} ${d.emit.end.cep ? `· CEP ${escHtml(cepFmt(d.emit.end.cep))}` : ""}</div>
        <div>${d.emit.end.fone ? `Fone: ${escHtml(foneFmt(d.emit.end.fone))}` : ""}</div>
      </div>
    </div>
    <div class="danfe-id">
      <div class="big">DANFE</div>
      <div style="font-size:7px">Documento Auxiliar da<br/>Nota Fiscal Eletrônica</div>
      <div class="tipo"><span style="font-size:6px">0-Entrada<br/>1-Saída</span><b>${escHtml(d.tpNF === "0" ? "0" : "1")}</b></div>
      <div><b>Nº</b> ${escHtml(d.nNF.padStart(9, "0"))}</div>
      <div><b>Série</b> ${escHtml(d.serie)} · <b>Mod</b> 55</div>
      <div style="font-size:6px">Folha 1/1</div>
    </div>
    <div class="barcode">
      <div style="font-size:6px">CHAVE DE ACESSO</div>
      ${code128cBars(d.chave)}
      <div class="chave">${escHtml(chaveFormatada(d.chave))}</div>
      <div class="qr">${qrCodeSvg(consultaNfeNacionalUrl(d.chave, d.tpAmb))}</div>
      <div style="font-size:6px;margin-top:1px">Consulte pela chave em www.nfe.fazenda.gov.br/portal</div>
    </div>
  </div>

  <div class="row">
    ${cel("Natureza da operação", d.natOp, 2)}
    ${cel("Protocolo de autorização de uso", [d.protocolo, dhFmt(d.dhProt)].filter(Boolean).join(" - "), 2)}
  </div>
  <div class="row">
    ${cel("Inscrição estadual", d.emit.ie)}
    ${cel("Inscr. estadual subst. trib.", "")}
    ${cel("CNPJ", docFmt("CNPJ", d.emit.doc.value), 1.4)}
  </div>

  <div class="secao">Destinatário / Remetente</div>
  <div class="row">
    ${cel("Nome / Razão social", d.dest.nome, 3)}
    ${cel(d.dest.doc.label, docFmt(d.dest.doc.label, d.dest.doc.value), 1.4)}
    ${cel("Data de emissão", dhFmt(d.dhEmi).slice(0, 10))}
  </div>
  <div class="row">
    ${cel("Endereço", enderecoLinha(d.dest.end), 3)}
    ${cel("Bairro", d.dest.end.bairro)}
    ${cel("CEP", cepFmt(d.dest.end.cep))}
    ${cel("Data saída/entrada", dhFmt(d.dhSaiEnt).slice(0, 10))}
  </div>
  <div class="row">
    ${cel("Município", d.dest.end.mun, 2)}
    ${cel("UF", d.dest.end.uf)}
    ${cel("Fone", foneFmt(d.dest.end.fone))}
    ${cel("Inscrição estadual", d.dest.ie)}
  </div>

  <div class="secao">Cálculo do Imposto</div>
  <div class="row">
    ${cel("Base de cálculo do ICMS", brl(t.vBC))}
    ${cel("Valor do ICMS", brl(t.vICMS))}
    ${cel("Base cálc. ICMS ST", brl(t.vBCST))}
    ${cel("Valor do ICMS ST", brl(t.vST))}
    ${cel("Valor aprox. tributos", brl(t.vTotTrib))}
    ${cel("Valor total produtos", brl(t.vProd))}
  </div>
  <div class="row">
    ${cel("Valor do frete", brl(t.vFrete))}
    ${cel("Valor do seguro", brl(t.vSeg))}
    ${cel("Desconto", brl(t.vDesc))}
    ${cel("Outras despesas", brl(t.vOutro))}
    ${cel("Valor do IPI", brl(t.vIPI))}
    ${cel("Valor total da nota", brl(t.vNF))}
  </div>
  ${reformaBloco}

  <div class="secao">Transportador / Volumes Transportados</div>
  <div class="row">
    ${cel("Nome / Razão social", d.transp.nome || "—", 2)}
    ${cel("Frete por conta", MOD_FRETE[d.transp.modFrete] ?? d.transp.modFrete, 1.5)}
    ${cel("Placa do veículo", d.transp.placa)}
    ${cel("UF", d.transp.ufVeic)}
    ${cel("CNPJ/CPF", d.transp.doc ? docFmt("CNPJ", d.transp.doc) : "—", 1.4)}
  </div>
  <div class="row">
    ${cel("Quantidade", d.transp.qVol)}
    ${cel("Espécie", d.transp.esp)}
    ${cel("Peso líquido", d.transp.pesoL)}
    ${cel("Peso bruto", d.transp.pesoB)}
  </div>

  <div class="secao">Dados dos Produtos / Serviços</div>
  <table class="itens">
    <thead>
      <tr>
        <th>Código</th><th>Descrição</th><th class="c">NCM</th><th class="c">CST</th><th class="c">CFOP</th>
        <th class="c">Un</th><th class="r">Qtd</th><th class="r">Vl. Unit.</th><th class="r">Vl. Total</th>
        <th class="r">BC ICMS</th><th class="r">Vl. ICMS</th><th class="r">Alíq.</th>
      </tr>
    </thead>
    <tbody>
      ${itensRows || `<tr><td colspan="12" class="c">Sem itens</td></tr>`}
    </tbody>
  </table>

  <div class="secao">Dados Adicionais</div>
  <div class="row">
    ${cel("Informações complementares", [d.infCpl, d.infFisco].filter(Boolean).join(" | "), 1)}
  </div>

  <div class="note">DANFE gerado pela plataforma a partir do XML autorizado (nfeProc). Para PDF, use "Imprimir → Salvar como PDF" no navegador.</div>
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
export function buildDanfe(nfeProcXml: string, opts?: DanfeOptions): { contentType: string; body: Buffer; filename: string } {
  const data = parseNfeProc(nfeProcXml);
  const html = renderHtml(data, opts);
  const filename = `DANFE-${data.chave || "nfe"}.html`;
  return {
    contentType: "text/html; charset=utf-8",
    body: Buffer.from(html, "utf8"),
    filename,
  };
}

/**
 * DANFSE (Documento Auxiliar da NFS-e) — representação gráfica da NFS-e do Sistema Nacional.
 *
 * Gera o DANFSE a partir do XML `<NFSe>` AUTORIZADO (devolvido pela SEFIN em GET /nfse/{chave}),
 * no leiaute clássico de documento fiscal (o mesmo estilo do DANFSE do ACBr): células com borda,
 * rótulo minúsculo em caixa alta e valor embaixo, códigos com descrição ("1 - Não optante"),
 * logo oficial NFS-e (réplica em SVG), chave em grupos de 5 e QR de consulta.
 *
 * A SEFIN NÃO gera PDF (GET /danfse → 501); o ADN gera, mas está em desativação — este gerador é o
 * substituto. HTML autocontido (CSS A4); o usuário salva como PDF pelo navegador.
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

/** Valor monetário pt-BR ("1234.56" → "1.234,56"). Vazio/zero → "" (o ACBr deixa em branco). */
function monBr(v: string | number | null | undefined, sempre = false): string {
  const n = Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n) || (n === 0 && !sempre)) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Soma valores string (ignora vazios/não numéricos). */
function soma(...vs: Array<string | null | undefined>): number {
  return vs.reduce<number>((acc, v) => {
    const n = Number(String(v ?? "").replace(",", "."));
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}

/** Data/hora ISO → "dd/mm/aaaa hh:mm:ss". Mantém o texto cru se não casar. */
function dhFmt(dh: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(dh);
  if (!m) return dh || "";
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}${m[6] ? `:${m[6]}` : ""}`;
}

/** Data ISO (aaaa-mm-dd) → "dd/mm/aaaa". */
function dataFmt(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d || "";
}

/** CNPJ/CPF formatado. */
function docFmt(value: string): string {
  const d = normalizeDocumento(value);
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return value;
}

/** Chave (50 díg.) em grupos de 5 para leitura humana (como o DANFSE do ACBr). */
function chaveFormatada(chave: string): string {
  return (chave.match(/.{1,5}/g) ?? []).join(" ");
}

/** CEP formatado. */
function cepFmt(v: string): string {
  const d = onlyDigits(v);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : v || "";
}

/** URL de consulta pública da NFS-e nacional pela chave (verificação de autenticidade). */
export function consultaPublicaNfseUrl(chave: string): string {
  return `https://www.nfse.gov.br/consultapublica/?tpc=1&chave=${normalizeDfeKey(chave)}`;
}

/** Logradouro em uma linha (sem município/CEP — vão em colunas separadas). */
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
  ambGer: string;
  verAplic: string;
  tpEmit: string;
  xLocEmi: string;
  xLocPrestacao: string;
  xLocIncid: string;
  emit: { nome: string; doc: string; im: string; fone: string; email: string; log: string; mun: string; cep: string };
  toma: { nome: string; doc: string; im: string; fone: string; email: string; log: string; mun: string; cep: string };
  interm: { nome: string; doc: string } | null;
  serv: { cTribNac: string; xTribNac: string; cTribMun: string; cNBS: string; xDescServ: string };
  simpNac: string;
  regApSN: string;
  regEspTrib: string;
  tribISSQN: string;        // 1=Tributável, 2=Exportação, 3=Não incidência, 4=Imunidade
  tpRetISSQN: string;       // 1=Não retido, 2=Retido pelo tomador, 3=Retido pelo intermediário
  valores: {
    vServ: string; vDescIncond: string; vDescCond: string; vDedRed: string;
    vBC: string; pAliq: string; vISSQN: string; vTotalRet: string; vLiq: string;
    vRetINSS: string; vRetIRRF: string; vRetCSLL: string; vRetPis: string; vRetCofins: string;
    totFed: string; totEst: string; totMun: string;
  };
  xInfComp: string;
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
  const tomaMun = tomaCMun && tomaCMun === pick(emitEnder, "cMun") ? emitMun : (tomaCMun || "");

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
    ambGer: pick(preDps, "ambGer"),
    verAplic: pick(preDps, "verAplic"),
    tpEmit: pick(dps, "tpEmit"),
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
    regEspTrib: pick(tribMun, "regEspTrib"),
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

/* ── Rótulos "código - descrição" (como o DANFSE do ACBr imprime) ─────────────────────────── */
function comCodigo(cod: string, label: string): string {
  return cod ? `${cod} - ${label}` : "";
}
function situacaoLabel(cStat: string): string {
  if (cStat === "100") return comCodigo(cStat, "NFS-e Gerada");
  if (cStat === "101") return comCodigo(cStat, "NFS-e Cancelada");
  if (cStat === "102") return comCodigo(cStat, "NFS-e Substituída");
  return cStat || "";
}
function ambGerLabel(cod: string): string {
  if (cod === "1") return comCodigo(cod, "Prefeitura");
  if (cod === "2") return comCodigo(cod, "Sistema Nacional da NFS-e");
  return cod || "";
}
function tpEmitLabel(cod: string): string {
  if (cod === "1" || !cod) return "1 - Prestador do Serviço";
  if (cod === "2") return comCodigo(cod, "Tomador do Serviço");
  if (cod === "3") return comCodigo(cod, "Intermediário do Serviço");
  return cod;
}
function simpNacLabel(cod: string): string {
  if (cod === "1") return comCodigo(cod, "Não optante");
  if (cod === "2") return comCodigo(cod, "Optante - MEI");
  if (cod === "3") return comCodigo(cod, "Optante - ME/EPP");
  return cod || "";
}
function tribISSQNLabel(cod: string): string {
  if (cod === "1") return comCodigo(cod, "Operação Tributável");
  if (cod === "2") return comCodigo(cod, "Exportação de Serviço");
  if (cod === "3") return comCodigo(cod, "Não Incidência");
  if (cod === "4") return comCodigo(cod, "Imunidade");
  return cod || "";
}
function retISSQNLabel(cod: string): string {
  if (cod === "1" || !cod) return "1 - Não Retido";
  if (cod === "2") return comCodigo(cod, "Retido pelo Tomador");
  if (cod === "3") return comCodigo(cod, "Retido pelo Intermediário");
  return cod;
}
function regEspLabel(cod: string): string {
  const mapa: Record<string, string> = {
    "0": "Nenhum", "1": "Ato Cooperado", "2": "Estimativa", "3": "Microempresa Municipal",
    "4": "Notário ou Registrador", "5": "Profissional Autônomo", "6": "Sociedade de Profissionais",
  };
  const c = cod || "0";
  return comCodigo(c, mapa[c] ?? c);
}

/** Réplica em SVG da logo oficial NFS-e (N verde com cunha amarela e ponto azul, "e" azul). */
function nfseLogoSvg(): string {
  return `<svg viewBox="0 0 300 205" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="NFS-e">
    <polygon points="30,118 30,26 92,118" fill="#f6c445"/>
    <circle cx="70" cy="34" r="21" fill="#28409a"/>
    <rect x="12" y="14" width="21" height="104" rx="4" fill="#2f9a48"/>
    <polygon points="33,14 54,14 112,118 91,118" fill="#2f9a48"/>
    <rect x="91" y="14" width="21" height="104" rx="4" fill="#2f9a48"/>
    <text x="118" y="118" font-family="Arial, Helvetica, sans-serif" font-size="118" font-weight="800" fill="#2f9a48" letter-spacing="-6">FS</text>
    <text x="238" y="118" font-family="Georgia, 'Times New Roman', serif" font-size="112" font-style="italic" font-weight="700" fill="#28409a">e</text>
    <text x="14" y="160" font-family="Arial, Helvetica, sans-serif" font-size="33" fill="#6a7c93">Nota Fiscal de</text>
    <text x="14" y="196" font-family="Arial, Helvetica, sans-serif" font-size="33" fill="#6a7c93">Serviço eletrônica</text>
  </svg>`;
}

/** Célula do grid (estilo ACBr): rótulo minúsculo em caixa alta + valor embaixo, com borda. */
function cel(label: string, value: string, flex = 1, extra = ""): string {
  return `<div class="c" style="flex:${flex}"><span class="lb">${escHtml(label)}</span><span class="vl ${extra}">${escHtml(value) || "&nbsp;"}</span></div>`;
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
    : "";
  const issRetido = d.tpRetISSQN === "2" || d.tpRetISSQN === "3";
  const totFederal = soma(v.vRetIRRF, v.vRetINSS, v.vRetCSLL, v.vRetPis, v.vRetCofins);
  const irrfCpCsll = soma(v.vRetIRRF, v.vRetINSS, v.vRetCSLL);
  const pisCofins = soma(v.vRetPis, v.vRetCofins);
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
  /* DANFSE no leiaute clássico (estilo ACBr): todas as células com borda, rótulo minúsculo em
     caixa alta e valor embaixo. */
  * { box-sizing: border-box; }
  @page { size: A4 portrait; margin: 5mm; }
  body { font-family: "Times New Roman", Times, serif; font-size: 9px; color: #000; margin: 0; background: #f5f6f8; }
  .doc { width: 200mm; margin: 0 auto; background: #fff; border-left: 1px solid #000; border-top: 1px solid #000; }
  .row { display: flex; }
  .c { border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 0 3px 1px; min-width: 0; overflow: hidden; }
  .lb { display: block; font-family: Arial, Helvetica, sans-serif; font-size: 5.8px; text-transform: uppercase; letter-spacing: .1px; padding-top: 1px; }
  .vl { display: block; font-size: 9.5px; word-wrap: break-word; line-height: 1.15; min-height: 10px; }
  .vl.b { font-weight: 700; }
  .sec { border-right: 1px solid #000; border-bottom: 1px solid #000; font-family: Arial, Helvetica, sans-serif; font-weight: 700; font-size: 7px; text-transform: uppercase; padding: 1px 3px; }
  /* Cabeçalho */
  .cab { display: flex; border-right: 1px solid #000; border-bottom: 1px solid #000; }
  .cab .logo { width: 34mm; padding: 3px 6px; display: flex; align-items: center; }
  .cab .logo svg { width: 100%; height: auto; }
  .cab .tit { flex: 1; padding: 4px 8px; display: flex; flex-direction: column; justify-content: center; gap: 2px; }
  .cab .tit .t1 { font-family: Arial, Helvetica, sans-serif; font-weight: 700; font-size: 11px; }
  .cab .tit .t2 { font-family: Arial, Helvetica, sans-serif; font-weight: 700; font-size: 10.5px; }
  .cab .tit .t3 { font-family: Arial, Helvetica, sans-serif; font-size: 10px; }
  /* Chave + QR */
  .keywrap { display: flex; }
  .keyleft { flex: 1; }
  .qrbox { width: 30mm; border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 3px 4px; text-align: center; }
  .qrbox svg { width: 22mm; height: 22mm; }
  .qrbox .cap { font-family: Arial, Helvetica, sans-serif; font-size: 5.4px; text-align: justify; line-height: 1.25; margin-top: 1px; }
  .chv { font-family: Arial, Helvetica, sans-serif; font-weight: 700; font-size: 10.5px; letter-spacing: .3px; }
  .descr { min-height: 88mm; }
  .homolog { text-align: center; font-family: Arial; font-weight: 800; border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 3px; letter-spacing: 1px; font-size: 9px; }
  .logo-emit { max-height: 26px; max-width: 80px; float: right; margin: 1px 2px; }
  .toolbar { text-align: center; padding: 10px; background: #fff; border-bottom: 1px solid #ddd; font-family: Arial; }
  .toolbar button { font-size: 13px; font-weight: 700; padding: 8px 18px; cursor: pointer; border: 0; border-radius: 5px; background: #2f9a48; color: #fff; }
  .toolbar .hint { display: block; font-size: 10px; color: #555; margin-top: 5px; }
  @media print { body { background: #fff; } .no-print { display: none !important; } .doc { width: auto; } @page { size: A4 portrait; margin: 5mm; } }
</style>
</head>
<body>
<div class="toolbar no-print">
  <button onclick="window.print()">🖨️ Imprimir / Salvar como PDF</button>
  <span class="hint">Na janela de impressão, escolha "Salvar como PDF" como destino.</span>
</div>
<div class="doc">
  <div class="cab">
    <div class="logo">${nfseLogoSvg()}</div>
    <div class="tit">
      <span class="t1">DOCUMENTO AUXILIAR DA NOTA FISCAL DE SERVIÇO ELETRÔNICA</span>
      <span class="t2">PREFEITURA MUNICIPAL DE ${escHtml((d.xLocIncid || d.xLocEmi || d.emit.mun || "").toUpperCase())}</span>
      <span class="t3">SECRETARIA DA FAZENDA MUNICIPAL</span>
    </div>
  </div>
  ${homolog}

  <div class="keywrap">
    <div class="keyleft">
      <div class="row"><div class="c" style="flex:1"><span class="lb">Chave de Acesso</span><span class="vl chv">${escHtml(chaveFormatada(d.chave))}</span></div></div>
      <div class="row">
        ${cel("Número da NFS-e", d.nNFSe, 1, "b")}
        ${cel("Competência da NFS-e", dataFmt(d.dCompet))}
        ${cel("Data/Hora da emissão da NFS-e", dhFmt(d.dhProc || d.dhEmi), 1.3)}
      </div>
      <div class="row">
        ${cel("Número da DPS", d.nDPS)}
        ${cel("Série da DPS", d.serie)}
        ${cel("Data/Hora da emissão da DPS", dhFmt(d.dhEmi), 1.3)}
      </div>
      <div class="row">
        ${cel("Situação da NFS-e", situacaoLabel(d.cStat))}
        ${cel("Ambiente Gerador da NFS-e", ambGerLabel(d.ambGer))}
        ${cel("Versão da Aplicação", d.verAplic, 1.3)}
      </div>
    </div>
    <div class="qrbox">
      ${qrCodeSvg(consultaPublicaNfseUrl(d.chave))}
      <div class="cap">A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e.</div>
    </div>
  </div>

  <div class="sec">EMITENTE DA NFS-e</div>
  <div class="row">
    ${cel("Tipo de Emitente", tpEmitLabel(d.tpEmit), 1.1)}
    ${cel("CPF / CNPJ", docFmt(d.emit.doc))}
    ${cel("Inscrição Municipal", d.emit.im)}
    ${cel("Telefone", d.emit.fone)}
  </div>
  <div class="row">
    ${cel("Nome / Razão Social", d.emit.nome, 2.2)}
    ${cel("Email", d.emit.email, 1.4)}
  </div>
  <div class="row">
    ${cel("Endereço", d.emit.log, 2)}
    ${cel("Município", d.emit.mun, 1.1)}
    ${cel("CEP", cepFmt(d.emit.cep), 0.5)}
  </div>
  <div class="row">
    ${cel("Simples Nacional na Data de Competência", simpNacLabel(d.simpNac), 1)}
    ${cel("Regime de Apuração Tributária pelo SN", d.regApSN, 1.6)}
  </div>

  <div class="sec">TOMADOR DO SERVIÇO</div>
  <div class="row">
    ${cel("CPF / CNPJ / NIF", d.toma.doc ? docFmt(d.toma.doc) : "", 1.1)}
    ${cel("Inscrição Municipal", d.toma.im)}
    ${cel("Telefone", d.toma.fone, 1.5)}
  </div>
  <div class="row">
    ${cel("Nome / Razão Social", d.toma.nome, 2.2)}
    ${cel("Email", d.toma.email, 1.4)}
  </div>
  <div class="row">
    ${cel("Endereço", d.toma.log, 2)}
    ${cel("Município", d.toma.mun, 1.1)}
    ${cel("CEP", cepFmt(d.toma.cep), 0.5)}
  </div>

  ${d.interm ? `
  <div class="sec">INTERMEDIÁRIO DO SERVIÇO</div>
  <div class="row">
    ${cel("CPF / CNPJ", d.interm.doc ? docFmt(d.interm.doc) : "", 1)}
    ${cel("Nome / Razão Social", d.interm.nome, 2.5)}
  </div>` : ""}

  <div class="sec">SERVIÇO PRESTADO</div>
  <div class="row">
    ${cel("Código de Tributação Nacional", cTribNacFmt, 1)}
  </div>
  <div class="row">
    ${cel("Código de Tributação Municipal", d.serv.cTribMun, 1)}
    ${cel("Local da Prestação", d.xLocPrestacao, 1)}
  </div>
  <div class="row">
    <div class="c descr" style="flex:1"><span class="lb">Descrição do Serviço</span><span class="vl">${escHtml(d.serv.xDescServ)}</span></div>
  </div>

  <div class="sec">TRIBUTAÇÃO MUNICIPAL</div>
  <div class="row">
    ${cel("Tributação do ISSQN", tribISSQNLabel(d.tribISSQN))}
    ${cel("Regime Especial de Tributação", regEspLabel(d.regEspTrib))}
    ${cel("Município de Incidência do ISSQN", d.xLocIncid)}
    ${cel("Tipo de Retenção do ISSQN", retISSQNLabel(d.tpRetISSQN))}
  </div>
  <div class="row">
    ${cel("Valor do Serviço (R$)", monBr(v.vServ, true), 1, "b")}
    ${cel("Desconto Incond. (R$)", monBr(v.vDescIncond))}
    ${cel("Total Ded/Red (R$)", monBr(v.vDedRed))}
    ${cel("Cálculo do BM (R$)", "")}
    ${cel("Base de Cálc. ISSQN (R$)", monBr(v.vBC))}
    ${cel("Alíq. Aplicada", Number(v.pAliq) > 0 ? `${monBr(v.pAliq, true)}%` : "")}
    ${cel("ISSQN Apurado (R$)", monBr(v.vISSQN))}
  </div>

  <div class="sec">TRIBUTAÇÃO FEDERAL</div>
  <div class="row">
    ${cel("IRRF (R$)", monBr(v.vRetIRRF))}
    ${cel("CP (R$)", monBr(v.vRetINSS))}
    ${cel("CSLL (R$)", monBr(v.vRetCSLL))}
    ${cel("PIS (R$)", monBr(v.vRetPis))}
    ${cel("COFINS (R$)", monBr(v.vRetCofins))}
    ${cel("Retenção do PIS/COFINS", pisCofins > 0 ? "Retido" : "")}
    ${cel("Total Tributação Federal (R$)", monBr(totFederal), 1, "b")}
  </div>

  <div class="sec">VALOR TOTAL DA NFS-e</div>
  <div class="row">
    ${cel("Valor do Serviço (R$)", monBr(v.vServ, true), 1, "b")}
    ${cel("Desc. Cond. (R$)", monBr(v.vDescCond))}
    ${cel("Desc. Incond. (R$)", monBr(v.vDescIncond))}
    ${cel("ISSQN Retido (R$)", issRetido ? monBr(v.vISSQN, true) : "")}
    ${cel("IRRF/CP/CSLL Retidos (R$)", monBr(irrfCpCsll))}
    ${cel("PIS/COFINS Retidos (R$)", monBr(pisCofins))}
    ${cel("Valor Líquido da NFS-e (R$)", monBr(v.vLiq, true), 1.1, "b")}
  </div>

  <div class="sec">TOTAIS APROXIMADOS DOS TRIBUTOS</div>
  <div class="row">
    ${cel("Federais", `R$ ${monBr(v.totFed, true) || "0,00"}`)}
    ${cel("Estaduais", `R$ ${monBr(v.totEst, true) || "0,00"}`)}
    ${cel("Municipais", `R$ ${monBr(v.totMun, true) || "0,00"}`, 2.5)}
  </div>

  <div class="sec">INFORMAÇÕES COMPLEMENTARES</div>
  <div class="row">
    <div class="c" style="flex:1;min-height:14mm"><span class="vl">${escHtml(infComp)}${logoEmit}</span></div>
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

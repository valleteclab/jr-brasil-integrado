/**
 * Builder do XML da NF-e (modelo 55), leiaute 4.00, para emissão DIRETA na SEFAZ.
 *
 * Espelha as MESMAS regras de negócio já usadas no provedor ACBr (seleção de grupo ICMS por
 * CST/CSOSN, PIS/COFINS por CST, acúmulo de totais a partir dos itens emitidos), mas serializa em
 * XML com a ORDEM de elementos exigida pelo schema (a SEFAZ valida ordem e o par grupo↔código).
 *
 * Escopo F1: NF-e 55 nos casos comuns (Simples e Normal/Presumido), com ICMS + PIS + COFINS por
 * item e ICMSTot reconciliado. IPI por item, IBS/CBS (Reforma) e grupos interestaduais a consumidor
 * final ficam para fases seguintes — a base aqui já está pronta para recebê-los.
 */
import type { RegimeTributario } from "@prisma/client";
import type { EmitInput } from "../types";
import type { ItemTaxResult } from "../../types";
import { aammFromDhEmi, deterministicCNF, montarChave } from "./chave";
import { cUFFromUF } from "./endpoints";

const onlyDigits = (s: string | number | null | undefined) => String(s ?? "").replace(/\D/g, "");

/** Escapa os 5 caracteres especiais de XML. */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Texto livre da NF-e: remove controle/quebra e normaliza espaços (a SEFAZ rejeita caracteres < 0x20). */
const sanitize = (v: string | null | undefined) =>
  (v ?? "").replace(/[\r\n\t\f\v]+/g, " ").replace(/[^\x20-\xFF]/g, "").replace(/ {2,}/g, " ").trim();

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** Monetário: 2 casas. */
const fmt = (n: number) => round2(n).toFixed(2);
/** Quantidade: até 4 casas (mínimo 4 para padronizar). */
const fmtQ = (n: number) => (Math.round((n + Number.EPSILON) * 1e4) / 1e4).toFixed(4);
/** Valor unitário: 2–10 casas (mantém precisão sem zeros à toa além da 2ª casa). */
function fmtUn(n: number): string {
  const fixed = (Math.round((n + Number.EPSILON) * 1e10) / 1e10).toFixed(10);
  const trimmed = fixed.replace(/0+$/, "");
  const dec = trimmed.split(".")[1] ?? "";
  return dec.length < 2 ? round2(n).toFixed(2) : trimmed;
}

/** Tag simples: <t>conteúdo</t> (vazio → string vazia, omitido pelo chamador). */
const tag = (t: string, v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? "" : `<${t}>${v}</${t}>`;

function isSimplesRegime(regime: RegimeTributario): boolean {
  return regime === "SIMPLES_NACIONAL" || regime === "MEI" || regime === "SIMPLES_EXCESSO_SUBLIMITE";
}

/**
 * CNPJ a informar no grupo de Autorização de download do XML (autXML), por UF que exige. A BAHIA
 * REJEITA a NF-e sem esse grupo; na ausência de escritório de contabilidade, a própria SEFAZ-BA
 * orienta informar o CNPJ dela. (Mesma regra já aplicada no provedor ACBr.)
 */
const UF_AUTXML_CNPJ: Record<string, string> = {
  BA: "13937073000156" // SEFAZ Bahia
};

/** CRT: 1=Simples, 2=Simples excesso sublimite, 3=Normal/Presumido. */
function crt(regime: RegimeTributario): number {
  if (regime === "SIMPLES_NACIONAL" || regime === "MEI") return 1;
  if (regime === "SIMPLES_EXCESSO_SUBLIMITE") return 2;
  return 3;
}

/** finNFe: 1=normal, 2=complementar, 3=ajuste, 4=devolução. */
function finNFe(fin: EmitInput["document"]["finalidade"]): number {
  switch (fin) {
    case "COMPLEMENTAR": return 2;
    case "AJUSTE": return 3;
    case "DEVOLUCAO": return 4;
    default: return 1;
  }
}

/** tPag (forma de pagamento SEFAZ). Subconjunto comum; 99=outros. */
function mapTpPag(forma: string | null | undefined): string {
  const f = (forma ?? "").toLowerCase();
  if (f.includes("sem pagamento") || f.includes("sem pgto")) return "90";
  if (f.includes("crediario") || f.includes("crediário") || f.includes("fiado") || f.includes("prazo")) return "05";
  if (f.includes("pix")) return "17";
  if (f.includes("credito") || f.includes("crédito") || f.includes("credit")) return "03";
  if (f.includes("debito") || f.includes("débito") || f.includes("debit")) return "04";
  if (f.includes("boleto") || f.includes("billet")) return "15";
  if (f.includes("dinheiro") || f.includes("cash") || f.includes("especie") || f.includes("espécie")) return "01";
  if (f.includes("transfer")) return "18";
  return "99";
}

/** dhEmi no fuso de São Paulo (-03:00), formato exigido pela SEFAZ (sem sufixo Z). */
function dhEmiBrasilia(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  }).formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}-03:00`;
}

/**
 * Grupo ICMS (XML) por regime + CST/CSOSN. ST (CST 60 / CSOSN 500) usa grupo próprio. A ordem dos
 * elementos dentro de cada grupo segue o schema 4.00.
 */
function icmsXml(simples: boolean, taxes: ItemTaxResult | undefined, base: number, orig: number): string {
  const vBCST = round2(taxes?.baseIcmsSt ?? 0);
  const pMVAST = round2(taxes?.percentualMva ?? 0);
  const pICMSST = round2(taxes?.aliquotaIcmsSt ?? 0);
  const vICMSST = round2(taxes?.valorIcmsSt ?? 0);
  const vBC = round2(taxes?.baseIcms ?? base);
  const pICMS = round2(taxes?.aliquotaIcms ?? 0);
  const vICMS = round2(taxes?.valorIcms ?? 0);
  const pFCP = round2(taxes?.percentualFcp ?? 0);
  const vFCP = round2(taxes?.valorFcp ?? 0);
  const fcp = pFCP > 0 || vFCP > 0 ? tag("pFCP", fmt(pFCP)) + tag("vFCP", fmt(vFCP)) : "";
  const stSubst = `<modBCST>4</modBCST>${pMVAST > 0 ? tag("pMVAST", fmt(pMVAST)) : ""}${tag("vBCST", fmt(vBCST))}${tag("pICMSST", fmt(pICMSST))}${tag("vICMSST", fmt(vICMSST))}`;

  if (simples) {
    const csosn = (taxes?.csosn ?? "102").padStart(3, "0");
    if ((csosn === "201" || csosn === "202" || csosn === "203") && vICMSST > 0) {
      const credito = csosn === "201" && vICMS > 0 ? tag("pCredSN", fmt(pICMS)) + tag("vCredICMSSN", fmt(vICMS)) : "";
      return `<ICMS><ICMSSN${csosn}><orig>${orig}</orig><CSOSN>${csosn}</CSOSN>${stSubst}${credito}</ICMSSN${csosn}></ICMS>`;
    }
    if (csosn === "500") {
      const pST = vBCST > 0 ? round2((vICMSST / vBCST) * 100) : 0;
      return `<ICMS><ICMSSN500><orig>${orig}</orig><CSOSN>500</CSOSN>${tag("vBCSTRet", fmt(vBCST))}${tag("pST", fmt(pST))}${tag("vICMSSTRet", fmt(vICMSST))}</ICMSSN500></ICMS>`;
    }
    if (csosn === "101") {
      return `<ICMS><ICMSSN101><orig>${orig}</orig><CSOSN>101</CSOSN>${tag("pCredSN", fmt(pICMS))}${tag("vCredICMSSN", fmt(vICMS))}</ICMSSN101></ICMS>`;
    }
    if (["102", "103", "300", "400"].includes(csosn)) {
      return `<ICMS><ICMSSN102><orig>${orig}</orig><CSOSN>${csosn}</CSOSN></ICMSSN102></ICMS>`;
    }
    return `<ICMS><ICMSSN900><orig>${orig}</orig><CSOSN>${csosn}</CSOSN></ICMSSN900></ICMS>`;
  }

  const cst = (taxes?.cstIcms ?? "00").padStart(2, "0");
  if ((cst === "10" || cst === "70") && vICMSST > 0) {
    return `<ICMS><ICMS${cst}><orig>${orig}</orig><CST>${cst}</CST><modBC>3</modBC>${tag("vBC", fmt(vBC))}${tag("pICMS", fmt(pICMS))}${tag("vICMS", fmt(vICMS))}${fcp}${stSubst}</ICMS${cst}></ICMS>`;
  }
  if (cst === "60") {
    const pST = vBCST > 0 ? round2((vICMSST / vBCST) * 100) : 0;
    return `<ICMS><ICMS60><orig>${orig}</orig><CST>60</CST>${tag("vBCSTRet", fmt(vBCST))}${tag("pST", fmt(pST))}${tag("vICMSSTRet", fmt(vICMSST))}</ICMS60></ICMS>`;
  }
  if (["40", "41", "50"].includes(cst)) {
    return `<ICMS><ICMS40><orig>${orig}</orig><CST>${cst}</CST></ICMS40></ICMS>`;
  }
  if (cst === "00") {
    return `<ICMS><ICMS00><orig>${orig}</orig><CST>00</CST><modBC>3</modBC>${tag("vBC", fmt(vBC))}${tag("pICMS", fmt(pICMS))}${tag("vICMS", fmt(vICMS))}${fcp}</ICMS00></ICMS>`;
  }
  return `<ICMS><ICMS90><orig>${orig}</orig><CST>${cst}</CST><modBC>3</modBC>${tag("vBC", fmt(vBC))}${tag("pICMS", fmt(pICMS))}${tag("vICMS", fmt(vICMS))}${fcp}</ICMS90></ICMS>`;
}

/** Grupo PIS ou COFINS (XML) por CST. Retorna { xml, nt } — nt=true quando não tributado (não soma total). */
function pisCofinsXml(tipo: "PIS" | "COFINS", cst: string, base: number, aliquota: number, valor: number): { xml: string; nt: boolean } {
  const c = (cst || "").padStart(2, "0");
  const aliqKey = tipo === "PIS" ? "pPIS" : "pCOFINS";
  const valKey = tipo === "PIS" ? "vPIS" : "vCOFINS";
  if (c === "01" || c === "02") {
    return { xml: `<${tipo}><${tipo}Aliq><CST>${c}</CST>${tag("vBC", fmt(base))}${tag(aliqKey, fmt(aliquota))}${tag(valKey, fmt(valor))}</${tipo}Aliq></${tipo}>`, nt: false };
  }
  if (["04", "05", "06", "07", "08", "09"].includes(c)) {
    return { xml: `<${tipo}><${tipo}NT><CST>${c}</CST></${tipo}NT></${tipo}>`, nt: true };
  }
  return { xml: `<${tipo}><${tipo}Outr><CST>${c}</CST>${tag("vBC", fmt(base))}${tag(aliqKey, fmt(aliquota))}${tag(valKey, fmt(valor))}</${tipo}Outr></${tipo}>`, nt: false };
}

function enderEmitXml(e: EmitInput["emitter"]): string {
  const cep = onlyDigits(e.cep);
  const fone = onlyDigits(e.telefone);
  return (
    `<enderEmit>` +
    tag("xLgr", esc(sanitize(e.logradouro) || "SEM LOGRADOURO")) +
    tag("nro", esc(sanitize(e.numero) || "S/N")) +
    (e.complemento ? tag("xCpl", esc(sanitize(e.complemento))) : "") +
    tag("xBairro", esc(sanitize(e.bairro) || "CENTRO")) +
    tag("cMun", onlyDigits(e.codigoMunicipioIbge)) +
    tag("xMun", esc(sanitize(e.cidade) || "")) +
    tag("UF", (e.uf ?? "").toUpperCase()) +
    (cep.length === 8 ? tag("CEP", cep) : "") +
    `<cPais>1058</cPais><xPais>BRASIL</xPais>` +
    (fone.length >= 8 ? tag("fone", fone) : "") +
    `</enderEmit>`
  );
}

function destXml(input: EmitInput, tpAmb: string): string {
  const d = input.document.destinatario;
  const doc = onlyDigits(d.documento);
  const docTag = doc.length === 14 ? tag("CNPJ", doc) : doc.length === 11 ? tag("CPF", doc) : "";
  // Homologação: a razão social do destinatário é fixada por exigência da SEFAZ (rejeição sem isso).
  const xNome = tpAmb === "2"
    ? "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
    : esc(sanitize(d.nome) || "CONSUMIDOR");
  const end = d.endereco;
  const cep = onlyDigits(end?.cep);
  const enderDest =
    end && sanitize(end.logradouro) && cep.length === 8
      ? `<enderDest>` +
        tag("xLgr", esc(sanitize(end.logradouro))) +
        tag("nro", esc(sanitize(end.numero) || "S/N")) +
        (end.complemento ? tag("xCpl", esc(sanitize(end.complemento))) : "") +
        tag("xBairro", esc(sanitize(end.bairro) || "CENTRO")) +
        tag("cMun", onlyDigits(end.codigoMunicipioIbge)) +
        tag("xMun", esc(sanitize(end.cidade) || "")) +
        tag("UF", (end.uf ?? d.uf ?? "").toUpperCase()) +
        tag("CEP", cep) +
        `<cPais>1058</cPais><xPais>BRASIL</xPais>` +
        `</enderDest>`
      : "";
  const ie = onlyDigits(d.inscricaoEstadual);
  const indIEDest = ie ? "1" : "9";
  return (
    `<dest>` +
    docTag +
    tag("xNome", xNome) +
    enderDest +
    `<indIEDest>${indIEDest}</indIEDest>` +
    (ie ? tag("IE", ie) : "") +
    (d.email ? tag("email", esc(sanitize(d.email))) : "") +
    `</dest>`
  );
}

export type BuildNfeResult = { xml: string; chave: string; cNF: string; cDV: string; nNF: number };

/**
 * Monta o XML da NF-e (não assinado): `<NFe xmlns=...><infNFe Id="NFe<chave>" versao="4.00">...`.
 * A assinatura (XMLDSig) é aplicada depois por `signNfe`.
 */
/**
 * Reforma Tributária (NT 2025.002) — a partir destas datas o grupo IBS/CBS é incluído no XML.
 * Homologação libera o destaque no período de teste (desde 01/01/2026); produção passa a EXIGIR
 * (e só então aceita) o grupo em 03/08/2026 para Lucro Presumido/Real — antes disso a SEFAZ de
 * produção rejeita o elemento por schema. O gate por ambiente evita quebrar a emissão em produção.
 */
const REFORMA_XML_INICIO: Record<string, string> = {
  HOMOLOGACAO: "2026-01-01",
  // Produção liberada após confirmarmos que a SEFAZ-BA aceita o grupo no período informativo
  // (cStat 100 em produção). Obrigatoriedade legal segue 03/08/2026 p/ Lucro Presumido/Real.
  PRODUCAO: "2026-01-01"
};

function reformaNoXml(ambiente: string): boolean {
  const inicio = REFORMA_XML_INICIO[ambiente] ?? REFORMA_XML_INICIO.PRODUCAO;
  return dhEmiBrasilia().slice(0, 10) >= inicio;
}

/** Formata alíquota da Reforma com 4 casas (pIBSUF/pIBSMun/pCBS aceitam 2 a 4 casas no XSD). */
function fmtAliq(value: number): string {
  return (Math.round((value + Number.EPSILON) * 10000) / 10000).toFixed(4);
}

/**
 * Grupo IBSCBS (NT 2025.002) de um item — det/imposto/IBSCBS. No período de teste 2026 todo o IBS
 * é de competência da UF (IBS-Mun = 0); CBS e IBS sobre a base do item (já com redução, se houver
 * regra). CST/cClassTrib vêm do motor (default 000 / 000001 = tributação integral). Devolve o XML
 * e os valores para reconciliar o totalizador IBSCBSTot (a SEFAZ valida total == soma dos itens).
 */
function ibsCbsItemXml(taxes: ItemTaxResult | undefined) {
  const vBC = round2(taxes?.baseIbsCbs ?? 0);
  const pIBSUF = taxes?.aliquotaIbs ?? 0; // período de teste: IBS integral na UF
  const vIBSUF = round2(taxes?.valorIbs ?? 0);
  const pIBSMun = 0;
  const vIBSMun = 0;
  const vIBS = round2(vIBSUF + vIBSMun);
  const pCBS = taxes?.aliquotaCbs ?? 0;
  const vCBS = round2(taxes?.valorCbs ?? 0);
  const cst = (taxes?.cstIbsCbs ?? "000").padStart(3, "0");
  const cClassTrib = (taxes?.cClassTrib ?? "000001").padStart(6, "0");
  const xml =
    `<IBSCBS>` +
    `<CST>${cst}</CST><cClassTrib>${cClassTrib}</cClassTrib>` +
    `<gIBSCBS>` +
    `<vBC>${fmt(vBC)}</vBC>` +
    `<gIBSUF><pIBSUF>${fmtAliq(pIBSUF)}</pIBSUF><vIBSUF>${fmt(vIBSUF)}</vIBSUF></gIBSUF>` +
    `<gIBSMun><pIBSMun>${fmtAliq(pIBSMun)}</pIBSMun><vIBSMun>${fmt(vIBSMun)}</vIBSMun></gIBSMun>` +
    `<vIBS>${fmt(vIBS)}</vIBS>` +
    `<gCBS><pCBS>${fmtAliq(pCBS)}</pCBS><vCBS>${fmt(vCBS)}</vCBS></gCBS>` +
    `</gIBSCBS>` +
    `</IBSCBS>`;
  return { xml, vBC, vIBSUF, vIBSMun, vIBS, vCBS };
}

export function buildNfeXml(input: EmitInput): BuildNfeResult {
  const e = input.emitter;
  const doc = input.document;
  const isNfce = doc.modelo === "NFCE";
  const simples = isSimplesRegime(e.regime);
  const ufEmit = (e.uf ?? "").toUpperCase();
  const ufDest = (doc.destinatario.endereco?.uf ?? doc.destinatario.uf ?? ufEmit).toUpperCase();
  const cUF = cUFFromUF(ufEmit);
  const cMunFG = onlyDigits(e.codigoMunicipioIbge);
  const tpAmb = doc.ambiente === "PRODUCAO" ? "1" : "2";
  const serie = String(Number(doc.serie) || 1);
  const nNF = input.numero;
  const mod = isNfce ? "65" : "55";
  const tpEmis = "1";

  const dhEmi = dhEmiBrasilia();
  const cNF = deterministicCNF(e.cnpj, mod, serie, String(nNF));
  const { chave, cDV } = montarChave({
    cUF, aamm: aammFromDhEmi(dhEmi), cnpj: onlyDigits(e.cnpj), mod, serie, nNF: String(nNF), tpEmis, cNF
  });

  // idDest: 1=interna, 2=interestadual, 3=exterior. indFinal: 1 quando destinatário não-contribuinte.
  // NFC-e é sempre intraestadual (idDest=1), consumidor final (indFinal=1) e saída (tpNF=1).
  const idDest = isNfce ? "1" : ufEmit && ufDest && ufEmit !== ufDest ? "2" : "1";
  const indFinal = isNfce || !doc.destinatario.inscricaoEstadual ? "1" : "0";
  const tpNF = !isNfce && doc.finalidade === "DEVOLUCAO" ? "0" : "1";
  const refChave = onlyDigits(doc.chaveReferenciada);

  const ide =
    `<ide>` +
    `<cUF>${cUF}</cUF><cNF>${cNF}</cNF>` +
    tag("natOp", esc(sanitize(doc.naturezaOperacao) || "VENDA")) +
    `<mod>${mod}</mod><serie>${serie}</serie><nNF>${nNF}</nNF>` +
    // dhSaiEnt: data/hora de saída (venda) ou entrada (devolução). Igual à emissão, como fazem os
    // demais emissores — preenche os campos "DATA/HORA SAÍDA" da DANFE. A NFC-e NÃO usa dhSaiEnt.
    `<dhEmi>${dhEmi}</dhEmi>${isNfce ? "" : `<dhSaiEnt>${dhEmi}</dhSaiEnt>`}<tpNF>${tpNF}</tpNF><idDest>${idDest}</idDest>` +
    // tpImp: 1 = DANFE (NF-e 55); 4 = DANFE NFC-e (cupom).
    `<cMunFG>${cMunFG}</cMunFG><tpImp>${isNfce ? "4" : "1"}</tpImp><tpEmis>${tpEmis}</tpEmis><cDV>${cDV}</cDV>` +
    `<tpAmb>${tpAmb}</tpAmb><finNFe>${finNFe(doc.finalidade)}</finNFe>` +
    `<indFinal>${indFinal}</indFinal><indPres>1</indPres><procEmi>0</procEmi><verProc>ERP-1.0</verProc>` +
    (refChave.length === 44 ? `<NFref><refNFe>${refChave}</refNFe></NFref>` : "") +
    `</ide>`;

  const emit =
    `<emit>` +
    tag("CNPJ", onlyDigits(e.cnpj)) +
    tag("xNome", esc(sanitize(e.razaoSocial))) +
    (e.nomeFantasia ? tag("xFant", esc(sanitize(e.nomeFantasia))) : "") +
    enderEmitXml(e) +
    (e.inscricaoEstadual ? tag("IE", onlyDigits(e.inscricaoEstadual)) : "<IE>ISENTO</IE>") +
    (e.inscricaoMunicipal ? tag("IM", onlyDigits(e.inscricaoMunicipal)) : "") +
    `<CRT>${crt(e.regime)}</CRT>` +
    `</emit>`;

  // NFC-e: destinatário é OPCIONAL (consumidor não identificado) — só inclui quando há CPF/CNPJ.
  const temDocDest = onlyDigits(doc.destinatario.documento).length >= 11;
  const dest = isNfce && !temDocDest ? "" : destXml(input, tpAmb);

  // autXML: grupo de autorização de download do XML, exigido por algumas UFs (BA rejeita sem ele).
  // Vai entre <dest> e <det> conforme a ordem do schema 4.00.
  const autXmlCnpj = UF_AUTXML_CNPJ[ufEmit];
  const autXML = autXmlCnpj ? `<autXML><CNPJ>${autXmlCnpj}</CNPJ></autXML>` : "";

  // Itens + acúmulo de totais a partir do que é REALMENTE emitido (a SEFAZ valida ICMSTot vs soma).
  const sum = { vBC: 0, vICMS: 0, vFCP: 0, vProd: 0, vDesc: 0, vPIS: 0, vCOFINS: 0, vBCST: 0, vST: 0 };
  // Reforma Tributária (IBS/CBS): só destaca no XML quando o gate do ambiente está aberto.
  const emitirReforma = reformaNoXml(doc.ambiente);
  const sumR = { vBC: 0, vIBSUF: 0, vIBSMun: 0, vIBS: 0, vCBS: 0 };
  const det = doc.itens.map((item, index) => {
    const numeroItem = index + 1;
    const taxes = input.computed.find((c) => c.numeroItem === numeroItem)?.taxes;
    const orig = Number(taxes?.origem ?? item.origem ?? "0") || 0;
    const base = round2(item.valorTotal - item.desconto);

    const icms = icmsXml(simples, taxes, base, orig);
    const pis = pisCofinsXml("PIS", simples ? taxes?.cstPis ?? "49" : taxes?.cstPis ?? "01", base, taxes?.aliquotaPis ?? 0, taxes?.valorPis ?? 0);
    const cofins = pisCofinsXml("COFINS", simples ? taxes?.cstCofins ?? "49" : taxes?.cstCofins ?? "01", base, taxes?.aliquotaCofins ?? 0, taxes?.valorCofins ?? 0);

    const cstIcms = (taxes?.cstIcms ?? "00").padStart(2, "0");
    const csosnIcms = (taxes?.csosn ?? "").padStart(3, "0");
    const semIcmsProprio = ["40", "41", "50", "60"].includes(cstIcms);
    sum.vProd = round2(sum.vProd + item.valorTotal);
    sum.vDesc = round2(sum.vDesc + (item.desconto || 0));
    if (!simples && !semIcmsProprio) {
      sum.vBC = round2(sum.vBC + (taxes?.baseIcms ?? base));
      sum.vICMS = round2(sum.vICMS + (taxes?.valorIcms ?? 0));
      sum.vFCP = round2(sum.vFCP + (taxes?.valorFcp ?? 0));
    }
    const vICMSSTItem = round2(taxes?.valorIcmsSt ?? 0);
    const emiteSt = vICMSSTItem > 0 && (
      (!simples && (cstIcms === "10" || cstIcms === "70")) ||
      (simples && (csosnIcms === "201" || csosnIcms === "202" || csosnIcms === "203"))
    );
    if (emiteSt) {
      sum.vBCST = round2(sum.vBCST + (taxes?.baseIcmsSt ?? 0));
      sum.vST = round2(sum.vST + vICMSSTItem);
    }
    if (!pis.nt) sum.vPIS = round2(sum.vPIS + (taxes?.valorPis ?? 0));
    if (!cofins.nt) sum.vCOFINS = round2(sum.vCOFINS + (taxes?.valorCofins ?? 0));

    const cProd = (item.codigo?.trim() || String(numeroItem)).slice(0, 60);
    const ncm = onlyDigits(item.ncm) || "00000000";
    const cfop = onlyDigits(item.cfop) || "5102";
    const prod =
      `<prod>` +
      tag("cProd", esc(cProd)) +
      `<cEAN>SEM GTIN</cEAN>` +
      // NFC-e em homologação: a SEFAZ exige a descrição fixa no PRIMEIRO item (não há destinatário
      // com xNome para carregar o aviso, como na NF-e 55). cStat 373 sem isso.
      tag("xProd", isNfce && tpAmb === "2" && numeroItem === 1
        ? "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
        : esc(sanitize(item.descricao) || cProd)) +
      tag("NCM", ncm) +
      (item.cest ? tag("CEST", onlyDigits(item.cest)) : "") +
      tag("CFOP", cfop) +
      tag("uCom", esc(sanitize(item.unidade) || "UN")) +
      tag("qCom", fmtQ(item.quantidade)) +
      tag("vUnCom", fmtUn(item.valorUnitario)) +
      tag("vProd", fmt(item.valorTotal)) +
      `<cEANTrib>SEM GTIN</cEANTrib>` +
      tag("uTrib", esc(sanitize(item.unidade) || "UN")) +
      tag("qTrib", fmtQ(item.quantidade)) +
      tag("vUnTrib", fmtUn(item.valorUnitario)) +
      (item.desconto > 0 ? tag("vDesc", fmt(item.desconto)) : "") +
      `<indTot>1</indTot>` +
      `</prod>`;
    // Reforma (IBS/CBS): grupo IBSCBS por item, após PIS/COFINS (é o último grupo de imposto do
    // item no leiaute: ...ICMSUFDest/IS/IBSCBS). Acumula para o totalizador IBSCBSTot.
    let ibsCbs = "";
    if (emitirReforma) {
      const r = ibsCbsItemXml(taxes);
      ibsCbs = r.xml;
      sumR.vBC = round2(sumR.vBC + r.vBC);
      sumR.vIBSUF = round2(sumR.vIBSUF + r.vIBSUF);
      sumR.vIBSMun = round2(sumR.vIBSMun + r.vIBSMun);
      sumR.vIBS = round2(sumR.vIBS + r.vIBS);
      sumR.vCBS = round2(sumR.vCBS + r.vCBS);
    }
    // Devolução (finNFe=4): cada item leva o grupo impostoDevol — percentual de mercadoria
    // devolvida (100% = devolução total) + IPI devolvido (0 quando não há IPI destacado).
    const impostoDevol = doc.finalidade === "DEVOLUCAO"
      ? `<impostoDevol><pDevol>100.00</pDevol><IPI><vIPIDevol>${fmt(taxes?.valorIpi ?? 0)}</vIPIDevol></IPI></impostoDevol>`
      : "";
    return `<det nItem="${numeroItem}">${prod}<imposto>${icms}${pis.xml}${cofins.xml}${ibsCbs}</imposto>${impostoDevol}</det>`;
  }).join("");

  // Totalizador IBS/CBS (NT 2025.002) — soma dos itens (a SEFAZ valida total == Σ itens). Vem
  // após ICMSTot no grupo <total>. Campos de diferimento/devolução/crédito presumido = 0 no caso
  // de tributação integral (período de teste). Só emitido com o gate da Reforma aberto.
  // Ordem conforme XSD oficial (TIBSCBSMonoTot, PL_010b v1.30): em gIBS os subgrupos UF/Mun e vIBS
  // vêm ANTES de vCredPres/vCredPresCondSus; em cada subgrupo a ordem é vDif → vDevTrib → valor.
  const ibsCbsTot = emitirReforma
    ? `<IBSCBSTot>` +
      `<vBCIBSCBS>${fmt(sumR.vBC)}</vBCIBSCBS>` +
      `<gIBS>` +
      `<gIBSUF><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vIBSUF>${fmt(sumR.vIBSUF)}</vIBSUF></gIBSUF>` +
      `<gIBSMun><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vIBSMun>${fmt(sumR.vIBSMun)}</vIBSMun></gIBSMun>` +
      `<vIBS>${fmt(sumR.vIBS)}</vIBS>` +
      `<vCredPres>0.00</vCredPres><vCredPresCondSus>0.00</vCredPresCondSus>` +
      `</gIBS>` +
      `<gCBS>` +
      `<vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vCBS>${fmt(sumR.vCBS)}</vCBS>` +
      `<vCredPres>0.00</vCredPres><vCredPresCondSus>0.00</vCredPresCondSus>` +
      `</gCBS>` +
      `</IBSCBSTot>`
    : "";

  const total =
    `<total><ICMSTot>` +
    `<vBC>${fmt(sum.vBC)}</vBC><vICMS>${fmt(sum.vICMS)}</vICMS><vICMSDeson>0.00</vICMSDeson>` +
    `<vFCP>${fmt(sum.vFCP)}</vFCP><vBCST>${fmt(sum.vBCST)}</vBCST><vST>${fmt(sum.vST)}</vST>` +
    `<vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet>` +
    `<vProd>${fmt(sum.vProd)}</vProd>` +
    `<vFrete>${fmt(doc.valorFrete)}</vFrete><vSeg>${fmt(doc.valorSeguro)}</vSeg>` +
    `<vDesc>${fmt(sum.vDesc + doc.valorDesconto)}</vDesc>` +
    `<vII>0.00</vII><vIPI>${fmt(input.totals.valorIpi)}</vIPI><vIPIDevol>0.00</vIPIDevol>` +
    `<vPIS>${fmt(sum.vPIS)}</vPIS><vCOFINS>${fmt(sum.vCOFINS)}</vCOFINS>` +
    `<vOutro>${fmt(doc.outrasDespesas)}</vOutro><vNF>${fmt(input.total)}</vNF>` +
    `</ICMSTot>${ibsCbsTot}</total>`;

  const modFrete = doc.modalidadeFrete ?? (doc.valorFrete > 0 ? 0 : 9);
  const transp = `<transp><modFrete>${modFrete}</modFrete></transp>`;

  // pag: devolução = sem pagamento (90); senão, pagamentos informados ou único pelo total.
  const tpPagFallback = doc.finalidade === "DEVOLUCAO" ? "90" : mapTpPag(doc.formaPagamento);
  const lista = (doc.pagamentos ?? []).filter((p) => Number(p.valor) > 0);
  let pagInner: string;
  if (tpPagFallback === "90") {
    pagInner = `<detPag><tPag>90</tPag><vPag>0.00</vPag></detPag>`;
  } else if (lista.length) {
    const detPag = lista.map((p) => {
      const tPag = mapTpPag(p.forma);
      const card = (tPag === "03" || tPag === "04" || tPag === "17") ? `<card><tpIntegra>2</tpIntegra></card>` : "";
      const xPag = tPag === "99" ? tag("xPag", esc(sanitize(p.forma) || "Outros")) : "";
      return `<detPag><tPag>${tPag}</tPag><vPag>${fmt(Number(p.valor))}</vPag>${card}${xPag}</detPag>`;
    }).join("");
    const recebido = round2(lista.reduce((s, p) => s + Number(p.valor), 0));
    const troco = round2(Math.max(recebido - input.total, 0));
    pagInner = detPag + (troco > 0 ? tag("vTroco", fmt(troco)) : "");
  } else {
    const card = (tpPagFallback === "03" || tpPagFallback === "04" || tpPagFallback === "17") ? `<card><tpIntegra>2</tpIntegra></card>` : "";
    const xPag = tpPagFallback === "99" ? tag("xPag", esc(sanitize(doc.formaPagamento) || "Outros")) : "";
    pagInner = `<detPag><tPag>${tpPagFallback}</tPag><vPag>${fmt(input.total)}</vPag>${card}${xPag}</detPag>`;
  }
  const pag = `<pag>${pagInner}</pag>`;

  const infoCompl = sanitize(doc.informacoesComplementares);
  // NFC-e: sempre leva infCpl (mensagem de tributos aproximados — Lei 12.741) quando não há texto
  // próprio, atendendo a recomendação do cupom. NF-e 55 só inclui o grupo quando há informações.
  const cplNfce = isNfce ? `Trib aprox R$ ${fmt(input.totals.valorTotalTributos || 0)} Fonte: IBPT` : "";
  const cpl = infoCompl || cplNfce;
  const infAdic = cpl ? `<infAdic><infCpl>${esc(cpl)}</infCpl></infAdic>` : "";

  const infNFe = `<infNFe Id="NFe${chave}" versao="4.00">${ide}${emit}${dest}${autXML}${det}${total}${transp}${pag}${infAdic}</infNFe>`;
  const xml = `<NFe xmlns="http://www.portalfiscal.inf.br/nfe">${infNFe}</NFe>`;
  return { xml, chave, cNF, cDV, nNF };
}

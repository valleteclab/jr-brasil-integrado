/**
 * Parser de XML avulso para o SPED Fiscal: lê NF-e/NFC-e processadas (nfeProc/NFe) com TODOS
 * os campos que os blocos C exigem (documento, participantes, itens e impostos por item) e
 * eventos de cancelamento (procEventoNFe, tpEvento 110111).
 *
 * Permite gerar o SPED de notas emitidas FORA do ERP (outro emissor) ou recebidas sem passar
 * pelo fluxo de entradas — caso clássico dos "geradores de SPED por XML" do mercado.
 */

import { XMLParser } from "fast-xml-parser";

export class SpedXmlError extends Error {}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true
});

function texto(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function numero(v: unknown): number {
  const n = Number(texto(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function lista<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

/** Primeiro nó-filho objeto de um grupo de imposto (ICMS00/ICMS60/ICMSSN102/PISAliq...). */
function primeiroNo(grupo: unknown): Record<string, unknown> | null {
  if (!grupo || typeof grupo !== "object") return null;
  for (const valor of Object.values(grupo as Record<string, unknown>)) {
    if (valor && typeof valor === "object") return valor as Record<string, unknown>;
  }
  return null;
}

export type XmlParticipante = {
  documento: string;
  nome: string;
  inscricaoEstadual: string | null;
  uf: string | null;
  codigoMunicipioIbge: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
};

export type XmlItem = {
  numeroItem: number;
  codigo: string;
  descricao: string;
  gtin: string | null;
  ncm: string | null;
  cest: string | null;
  cfop: string | null;
  unidade: string;
  quantidade: number;
  valorTotal: number;
  valorDesconto: number;
  origem: string | null;
  cstIcms: string | null;
  csosn: string | null;
  baseIcms: number;
  aliquotaIcms: number;
  valorIcms: number;
  baseIcmsSt: number;
  aliquotaIcmsSt: number;
  valorIcmsSt: number;
  cstIpi: string | null;
  baseIpi: number;
  aliquotaIpi: number;
  valorIpi: number;
  cstPis: string | null;
  basePis: number;
  aliquotaPis: number;
  valorPis: number;
  cstCofins: string | null;
  baseCofins: number;
  aliquotaCofins: number;
  valorCofins: number;
  /** Crédito de ICMS do Simples Nacional (art. 23 LC 123): ICMSSN101/900 pCredSN/vCredICMSSN. */
  aliquotaCredSN: number;
  valorCredSN: number;
};

export type XmlDocumentoSped = {
  kind: "DOCUMENTO";
  chaveAcesso: string;
  modelo: "55" | "65";
  numero: string;
  serie: string;
  emitidaEm: Date | null;
  aPrazo: boolean;
  emitente: XmlParticipante;
  destinatario: XmlParticipante | null;
  totais: {
    valorNota: number;
    valorProdutos: number;
    valorDesconto: number;
    valorFrete: number;
    valorSeguro: number;
    outrasDespesas: number;
  };
  itens: XmlItem[];
  /** Texto das informações complementares (infAdic/infCpl) — fonte do crédito "por extenso". */
  informacoesComplementares: string | null;
  /** Crédito de ICMS (LC 123) mencionado no TEXTO do infCpl, quando não vier estruturado. */
  creditoSimplesInfCpl: number;
};

export type XmlCancelamentoSped = {
  kind: "CANCELAMENTO";
  chaveAcesso: string;
};

export type XmlSpedParseado = XmlDocumentoSped | XmlCancelamentoSped;

/** Extrai modelo/série/número/competência embutidos na chave de acesso (44 dígitos). */
export function dadosDaChave(chave: string): {
  modelo: string;
  serie: string;
  numero: string;
  ano: number;
  mes: number;
  emitenteDocumento: string;
} {
  const c = chave.replace(/\D/g, "");
  if (c.length !== 44) throw new SpedXmlError("Chave de acesso inválida (esperados 44 dígitos).");
  return {
    emitenteDocumento: c.slice(6, 20),
    modelo: c.slice(20, 22),
    serie: String(Number(c.slice(22, 25))),
    numero: String(Number(c.slice(25, 34))),
    ano: 2000 + Number(c.slice(2, 4)),
    mes: Number(c.slice(4, 6))
  };
}

function parseParticipante(no: Record<string, unknown> | undefined, ender: string): XmlParticipante | null {
  if (!no) return null;
  const end = (no[ender] ?? {}) as Record<string, unknown>;
  const documento = texto(no.CNPJ) || texto(no.CPF);
  const nome = texto(no.xNome);
  if (!documento && !nome) return null;
  return {
    documento: documento.replace(/\D/g, ""),
    nome,
    inscricaoEstadual: texto(no.IE) || null,
    uf: texto(end.UF).toUpperCase() || null,
    codigoMunicipioIbge: texto(end.cMun) || null,
    logradouro: texto(end.xLgr) || null,
    numero: texto(end.nro) || null,
    complemento: texto(end.xCpl) || null,
    bairro: texto(end.xBairro) || null
  };
}

export function parseXmlSped(xmlText: string): XmlSpedParseado {
  if (!xmlText?.trim()) throw new SpedXmlError("XML vazio.");
  let raiz: Record<string, unknown>;
  try {
    raiz = parser.parse(xmlText);
  } catch {
    throw new SpedXmlError("Arquivo não é um XML válido.");
  }

  // Evento de cancelamento (procEventoNFe / evento avulso).
  const evento =
    (raiz as any)?.procEventoNFe?.evento?.infEvento ?? (raiz as any)?.evento?.infEvento ?? null;
  if (evento) {
    const tpEvento = texto(evento.tpEvento);
    const chave = texto(evento.chNFe).replace(/\D/g, "");
    if (tpEvento !== "110111") {
      throw new SpedXmlError(`Evento ${tpEvento || "desconhecido"} não suportado (apenas cancelamento 110111).`);
    }
    if (chave.length !== 44) throw new SpedXmlError("Evento de cancelamento sem chave de acesso válida.");
    return { kind: "CANCELAMENTO", chaveAcesso: chave };
  }

  const nfe = (raiz as any)?.nfeProc?.NFe ?? (raiz as any)?.NFe;
  const infNfe = nfe?.infNFe;
  if (!infNfe) throw new SpedXmlError("XML não reconhecido: esperado NF-e/NFC-e (infNFe) ou evento de cancelamento.");

  const ide = infNfe.ide ?? {};
  const total = infNfe.total?.ICMSTot ?? {};
  const chave =
    texto(infNfe["@_Id"]).replace(/^NFe/i, "").replace(/\D/g, "") ||
    texto((raiz as any)?.nfeProc?.protNFe?.infProt?.chNFe).replace(/\D/g, "");
  if (chave.length !== 44) throw new SpedXmlError("XML sem chave de acesso (infNFe Id / protNFe).");

  const modelo = texto(ide.mod) === "65" ? "65" : "55";
  const dhEmi = texto(ide.dhEmi) || texto(ide.dEmi);
  const emitidaEm = dhEmi ? new Date(dhEmi.length === 10 ? `${dhEmi}T00:00:00` : dhEmi) : null;

  const emitente = parseParticipante(infNfe.emit, "enderEmit");
  if (!emitente) throw new SpedXmlError("XML sem dados do emitente.");
  const destinatario = parseParticipante(infNfe.dest, "enderDest");

  const dups = lista((infNfe.cobr ?? {}).dup);

  const itens: XmlItem[] = lista(infNfe.det).map((det: Record<string, unknown>, idx) => {
    const prod = (det.prod ?? {}) as Record<string, unknown>;
    const imposto = (det.imposto ?? {}) as Record<string, unknown>;
    const icms = primeiroNo(imposto.ICMS) ?? {};
    const ipi = primeiroNo(imposto.IPI) ?? {};
    const pis = primeiroNo(imposto.PIS) ?? {};
    const cofins = primeiroNo(imposto.COFINS) ?? {};
    const gtin = texto(prod.cEAN) || texto(prod.cEANTrib);
    return {
      numeroItem: Number(texto(det["@_nItem"])) || idx + 1,
      codigo: texto(prod.cProd) || `ITEM-${idx + 1}`,
      descricao: texto(prod.xProd),
      gtin: gtin && gtin.toUpperCase() !== "SEM GTIN" ? gtin : null,
      ncm: texto(prod.NCM) || null,
      cest: texto(prod.CEST) || null,
      cfop: texto(prod.CFOP) || null,
      unidade: texto(prod.uCom) || "UN",
      quantidade: numero(prod.qCom),
      valorTotal: numero(prod.vProd),
      valorDesconto: numero(prod.vDesc),
      origem: texto(icms.orig) || null,
      cstIcms: texto(icms.CST) || null,
      csosn: texto(icms.CSOSN) || null,
      baseIcms: numero(icms.vBC),
      aliquotaIcms: numero(icms.pICMS),
      valorIcms: numero(icms.vICMS),
      baseIcmsSt: numero(icms.vBCST),
      aliquotaIcmsSt: numero(icms.pICMSST),
      valorIcmsSt: numero(icms.vICMSST),
      cstIpi: texto(ipi.CST) || null,
      baseIpi: numero(ipi.vBC),
      aliquotaIpi: numero(ipi.pIPI),
      valorIpi: numero(ipi.vIPI),
      cstPis: texto(pis.CST) || null,
      basePis: numero(pis.vBC),
      aliquotaPis: numero(pis.pPIS),
      valorPis: numero(pis.vPIS),
      cstCofins: texto(cofins.CST) || null,
      baseCofins: numero(cofins.vBC),
      aliquotaCofins: numero(cofins.pCOFINS),
      valorCofins: numero(cofins.vCOFINS),
      aliquotaCredSN: numero(icms.pCredSN),
      valorCredSN: numero(icms.vCredICMSSN)
    };
  });
  if (itens.length === 0) throw new SpedXmlError("XML sem itens de produto.");

  // Informações complementares: fornecedores do Simples às vezes informam o crédito da LC 123
  // apenas no texto ("PERMITE O APROVEITAMENTO DO CRÉDITO DE ICMS NO VALOR DE R$ 12,34 ...").
  const infCpl = texto((infNfe.infAdic ?? {}).infCpl) || null;
  let creditoSimplesInfCpl = 0;
  if (infCpl && /cr[eé]dito\s+de\s+icms/i.test(infCpl)) {
    // Ex.: "...APROVEITAMENTO DO CRÉDITO DE ICMS NO VALOR DE R$ 14,00, CORRESPONDENTE À..."
    const m = /cr[eé]dito\s+de\s+icms.{0,60}?([\d.]*\d,\d{2})/i.exec(infCpl);
    if (m) creditoSimplesInfCpl = numero(m[1].replace(/\./g, "").replace(",", "."));
  }

  return {
    kind: "DOCUMENTO",
    chaveAcesso: chave,
    modelo,
    numero: texto(ide.nNF) || dadosDaChave(chave).numero,
    serie: texto(ide.serie) || dadosDaChave(chave).serie,
    emitidaEm,
    aPrazo: dups.length > 0 || texto(ide.indPag) === "1",
    emitente,
    destinatario,
    totais: {
      valorNota: numero(total.vNF),
      valorProdutos: numero(total.vProd),
      valorDesconto: numero(total.vDesc),
      valorFrete: numero(total.vFrete),
      valorSeguro: numero(total.vSeg),
      outrasDespesas: numero(total.vOutro)
    },
    itens,
    informacoesComplementares: infCpl,
    creditoSimplesInfCpl
  };
}

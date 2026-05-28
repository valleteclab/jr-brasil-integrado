import { XMLParser } from "fast-xml-parser";

export type ParsedNfeItem = {
  itemNumber: number;
  supplierCode: string;
  description: string;
  gtin?: string;
  ncm?: string;
  cest?: string;
  cfop?: string;
  unit: string;
  quantity: number;
  unitValue: number;
  totalValue: number;
  discountValue: number;
  taxes: ParsedNfeTax[];
};

export type ParsedNfeInstallment = {
  number: string;
  dueDate?: Date;
  value: number;
};

export type ParsedNfeTax = {
  tax: "ICMS" | "IPI" | "PIS" | "COFINS";
  cst?: string;
  csosn?: string;
  base?: number;
  rate?: number;
  value?: number;
  // ICMS-ST — preenchido quando CST é 10, 30, 70 ou 90
  baseST?: number;
  mva?: number;
  aliquotaST?: number;
  valorST?: number;
  // FCP — Fundo de Combate à Pobreza
  aliquotaFCP?: number;
  valorFCP?: number;
  aliquotaFCPST?: number;
  valorFCPST?: number;
  raw: unknown;
};

export type ParsedNfeTotals = {
  bcICMS: number;
  icms: number;
  bcICMSST: number;
  icmsST: number;
  ipi: number;
  pis: number;
  cofins: number;
  fcp: number;
  fcpST: number;
  tributos: number;
};

export type ParsedNfe = {
  accessKey?: string;
  number?: string;
  series?: string;
  model?: string;
  issuedAt?: Date;
  supplierDocument?: string;
  supplierName?: string;
  mainCfop?: string;
  totalProducts: number;
  totalInvoice: number;
  freightValue: number;
  insuranceValue: number;
  discountValue: number;
  otherExpenses: number;
  // Modal frete: 0-CIF, 1-FOB, 2-Terceiros, 3-Próprio Rem., 4-Próprio Dest., 9-Sem frete
  freightModal?: number;
  taxTotals: ParsedNfeTotals;
  installments: ParsedNfeInstallment[];
  items: ParsedNfeItem[];
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true
});

function arrayOf<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function text(value: unknown) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function num(value: unknown) {
  return Number(text(value).replace(",", ".")) || 0;
}

function firstTaxNode(group: unknown): Record<string, unknown> | undefined {
  if (!group || typeof group !== "object") {
    return undefined;
  }

  const entries = Object.entries(group as Record<string, unknown>);
  const nested = entries.find(([, value]) => value && typeof value === "object");
  return nested?.[1] as Record<string, unknown> | undefined;
}

function readTax(group: unknown, tax: ParsedNfeTax["tax"]): ParsedNfeTax | undefined {
  const node = firstTaxNode(group);

  if (!node) {
    return undefined;
  }

  // CST/CSOSN
  const cst = text(node.CST) || undefined;
  const csosn = text(node.CSOSN) || undefined;

  // Base/alíquota/valor — ICMS usa pICMS/vICMS, demais usam p{Tax}/v{Tax}
  const base = num(node.vBC) || undefined;
  const rate = num(node[`p${tax}`]) || num(node.pICMS) || undefined;
  const value = num(node[`v${tax}`]) || num(node.vICMS) || undefined;

  // ICMS-ST (campos presentes quando CST 10, 30, 70, 90)
  const baseST = num(node.vBCST) || undefined;
  const mva = num(node.pMVAST) || undefined;
  const aliquotaST = num(node.pICMSST) || undefined;
  const valorST = num(node.vICMSST) || undefined;

  // FCP — Fundo de Combate à Pobreza (estados do Nordeste e Norte principalmente)
  const aliquotaFCP = num(node.pFCP) || undefined;
  const valorFCP = num(node.vFCP) || undefined;
  const aliquotaFCPST = num(node.pFCPST) || undefined;
  const valorFCPST = num(node.vFCPST) || undefined;

  return {
    tax,
    cst,
    csosn,
    base,
    rate,
    value,
    baseST,
    mva,
    aliquotaST,
    valorST,
    aliquotaFCP,
    valorFCP,
    aliquotaFCPST,
    valorFCPST,
    raw: node
  };
}

export function parseNfeXml(xmlText: string): ParsedNfe {
  const parsed = parser.parse(xmlText);
  const nfe = parsed?.nfeProc?.NFe ?? parsed?.NFe;
  const infNfe = nfe?.infNFe;

  if (!infNfe) {
    throw new Error("XML de NF-e inválido: grupo infNFe não encontrado.");
  }

  const ide = infNfe.ide ?? {};
  const emit = infNfe.emit ?? {};
  const icmsTot = infNfe.total?.ICMSTot ?? {};
  const transp = infNfe.transp ?? {};
  const items = arrayOf(infNfe.det);
  const billing = infNfe.cobr ?? {};

  const installments = arrayOf(billing.dup)
    .map((dup: Record<string, unknown>, index) => ({
      number: text(dup.nDup) || String(index + 1).padStart(3, "0"),
      dueDate: text(dup.dVenc) ? new Date(`${text(dup.dVenc)}T00:00:00`) : undefined,
      value: num(dup.vDup)
    }))
    .filter((dup) => dup.value > 0);

  if (!items.length) {
    throw new Error("XML de NF-e sem itens de produto.");
  }

  const parsedItems = items.map((det: Record<string, unknown>, index) => {
    const prod = (det.prod ?? {}) as Record<string, unknown>;
    const imposto = (det.imposto ?? {}) as Record<string, unknown>;
    const taxes = [
      readTax(imposto.ICMS, "ICMS"),
      readTax(imposto.IPI, "IPI"),
      readTax(imposto.PIS, "PIS"),
      readTax(imposto.COFINS, "COFINS")
    ].filter(Boolean) as ParsedNfeTax[];

    return {
      itemNumber: Number(text(det["@_nItem"])) || index + 1,
      supplierCode: text(prod.cProd),
      description: text(prod.xProd),
      gtin: text(prod.cEAN) || text(prod.cEANTrib) || undefined,
      ncm: text(prod.NCM) || undefined,
      cest: text(prod.CEST) || undefined,
      cfop: text(prod.CFOP) || undefined,
      unit: text(prod.uCom) || "UN",
      quantity: num(prod.qCom),
      unitValue: num(prod.vUnCom),
      totalValue: num(prod.vProd),
      discountValue: num(prod.vDesc),
      taxes
    };
  });

  // Totais fiscais da NF-e — gravados para SPED e conciliação
  const taxTotals: ParsedNfeTotals = {
    bcICMS: num(icmsTot.vBC),
    icms: num(icmsTot.vICMS),
    bcICMSST: num(icmsTot.vBCST),
    icmsST: num(icmsTot.vICMSST),
    ipi: num(icmsTot.vIPI),
    pis: num(icmsTot.vPIS),
    cofins: num(icmsTot.vCOFINS),
    fcp: num(icmsTot.vFCP),
    fcpST: num(icmsTot.vFCPST),
    tributos: num(icmsTot.vTotTrib)
  };

  return {
    accessKey: text(infNfe["@_Id"]).replace(/^NFe/, "") || text(parsed?.nfeProc?.protNFe?.infProt?.chNFe) || undefined,
    number: text(ide.nNF) || undefined,
    series: text(ide.serie) || undefined,
    model: text(ide.mod) || undefined,
    issuedAt: text(ide.dhEmi) ? new Date(text(ide.dhEmi)) : undefined,
    supplierDocument: text(emit.CNPJ) || text(emit.CPF) || undefined,
    supplierName: text(emit.xNome) || undefined,
    mainCfop: parsedItems[0]?.cfop,
    totalProducts: num(icmsTot.vProd),
    totalInvoice: num(icmsTot.vNF),
    freightValue: num(icmsTot.vFrete),
    insuranceValue: num(icmsTot.vSeg),
    discountValue: num(icmsTot.vDesc),
    otherExpenses: num(icmsTot.vOutro),
    freightModal: text(transp.modFrete) !== "" ? Number(text(transp.modFrete)) : undefined,
    taxTotals,
    installments,
    items: parsedItems
  };
}

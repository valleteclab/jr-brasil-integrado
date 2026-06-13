import { XMLParser } from "fast-xml-parser";
import { extrairCreditoSimplesDoTexto } from "@/domains/fiscal/sped/xml-avulso";

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
  /** Unidade tributável da NF-e (uTrib) — costuma ser a unidade de revenda (ex.: UN). */
  taxableUnit?: string;
  /** Quantidade tributável da NF-e (qTrib) — ex.: 12 quando vem 1 caixa de 12. */
  taxableQuantity?: number;
  /** Fator de conversão sugerido (qTrib ÷ qCom) quando a unidade tributável difere da comercial. */
  suggestedConversion?: number;
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
  /** Crédito de ICMS de fornecedor do Simples (LC 123, art. 23): pCredSN/vCredICMSSN. */
  credSnRate?: number;
  credSnValue?: number;
  raw: unknown;
};

export type ParsedNfe = {
  /** Informações complementares do XML (infAdic/infCpl). */
  infCpl?: string;
  /** Crédito de ICMS (LC 123) mencionado no TEXTO do infCpl (0 quando não há). */
  creditoSimplesInfCpl: number;
  accessKey?: string;
  number?: string;
  series?: string;
  model?: string;
  issuedAt?: Date;
  supplierDocument?: string;
  supplierName?: string;
  supplierUf?: string;
  mainCfop?: string;
  totalProducts: number;
  totalInvoice: number;
  freightValue: number;
  insuranceValue: number;
  discountValue: number;
  otherExpenses: number;
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

function numberValue(value: unknown) {
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

  return {
    tax,
    cst: text(node.CST) || undefined,
    csosn: text(node.CSOSN) || undefined,
    base: numberValue(node.vBC) || undefined,
    rate: numberValue(node[`p${tax}`]) || numberValue(node.pICMS) || undefined,
    value: numberValue(node[`v${tax}`]) || numberValue(node.vICMS) || undefined,
    // Fornecedor do Simples (ICMSSN101/900): crédito permitido ao adquirente (LC 123, art. 23).
    credSnRate: tax === "ICMS" ? numberValue(node.pCredSN) || undefined : undefined,
    credSnValue: tax === "ICMS" ? numberValue(node.vCredICMSSN) || undefined : undefined,
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
  const total = infNfe.total?.ICMSTot ?? {};
  const items = arrayOf(infNfe.det);
  const billing = infNfe.cobr ?? {};
  const installments = arrayOf(billing.dup).map((dup: Record<string, unknown>, index) => ({
    number: text(dup.nDup) || String(index + 1).padStart(3, "0"),
    dueDate: text(dup.dVenc) ? new Date(`${text(dup.dVenc)}T00:00:00`) : undefined,
    value: numberValue(dup.vDup)
  })).filter((dup) => dup.value > 0);

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

    const unitComercial = text(prod.uCom) || "UN";
    const qtdComercial = numberValue(prod.qCom);
    const unitTrib = text(prod.uTrib) || undefined;
    const qtdTrib = numberValue(prod.qTrib);
    // Sugere o fator de embalagem quando a unidade tributável difere da comercial e a quantidade
    // tributável é maior (ex.: 1 CX comercial → 12 UN tributável ⇒ fator 12). Arredonda para evitar
    // ruído de ponto flutuante. Só sugere > 1 (1 caixa = 1 unidade não precisa de conversão).
    const ratio = unitTrib && unitTrib !== unitComercial && qtdComercial > 0 && qtdTrib > qtdComercial
      ? Math.round((qtdTrib / qtdComercial) * 1_000_000) / 1_000_000
      : 1;

    return {
      itemNumber: Number(text(det["@_nItem"])) || index + 1,
      supplierCode: text(prod.cProd),
      description: text(prod.xProd),
      gtin: text(prod.cEAN) || text(prod.cEANTrib) || undefined,
      ncm: text(prod.NCM) || undefined,
      cest: text(prod.CEST) || undefined,
      cfop: text(prod.CFOP) || undefined,
      unit: unitComercial,
      quantity: qtdComercial,
      unitValue: numberValue(prod.vUnCom),
      totalValue: numberValue(prod.vProd),
      discountValue: numberValue(prod.vDesc),
      taxableUnit: unitTrib,
      taxableQuantity: qtdTrib || undefined,
      suggestedConversion: ratio > 1 ? ratio : 1,
      taxes
    };
  });

  const infCpl = text((infNfe.infAdic ?? {}).infCpl) || undefined;

  return {
    infCpl,
    creditoSimplesInfCpl: extrairCreditoSimplesDoTexto(infCpl),
    accessKey: text(infNfe["@_Id"]).replace(/^NFe/, "") || text(parsed?.nfeProc?.protNFe?.infProt?.chNFe) || undefined,
    number: text(ide.nNF) || undefined,
    series: text(ide.serie) || undefined,
    model: text(ide.mod) || undefined,
    issuedAt: text(ide.dhEmi) ? new Date(text(ide.dhEmi)) : undefined,
    supplierDocument: text(emit.CNPJ) || text(emit.CPF) || undefined,
    supplierName: text(emit.xNome) || undefined,
    supplierUf: text((emit.enderEmit as Record<string, unknown> | undefined)?.UF).toUpperCase() || undefined,
    mainCfop: parsedItems[0]?.cfop,
    totalProducts: numberValue(total.vProd),
    totalInvoice: numberValue(total.vNF),
    freightValue: numberValue(total.vFrete),
    insuranceValue: numberValue(total.vSeg),
    discountValue: numberValue(total.vDesc),
    otherExpenses: numberValue(total.vOutro),
    installments,
    items: parsedItems
  };
}

export type ProductPayload = Record<string, unknown>;

export type ValidatedProductInput = {
  sku: string;
  name: string;
  brand: string;
  category: string;
  type: "PRODUTO" | "SERVICO" | "KIT" | "INSUMO";
  originalCode?: string;
  manufacturerCode?: string;
  barcode?: string;
  unit: string;
  purchaseUnit: string;
  purchaseConversion: number;
  shortDescription?: string;
  technicalDescription?: string;
  storeDescription?: string;
  // Fiscal básico
  ncm?: string;
  cest?: string;
  origin?: string;
  cfopInState?: string;
  cfopOutState?: string;
  taxRuleId?: string;
  // ICMS
  icmsCST?: string;
  icmsCSOSN?: string;
  icmsModBC?: number;
  icmsAliquota?: number;
  icmsReducaoBC?: number;
  // ICMS-ST
  icmsSTModBC?: number;
  icmsSTMVA?: number;
  icmsSTReducaoBC?: number;
  icmsSTAliquota?: number;
  // FCP
  fcpAliquota?: number;
  fcpSTAliquota?: number;
  // IPI
  ipiCST?: string;
  ipiCodEnq?: string;
  ipiAliquota?: number;
  // PIS
  pisCST?: string;
  pisAliquota?: number;
  // COFINS
  cofinsCST?: string;
  cofinsAliquota?: number;
  // ISS
  issAliquota?: number;
  issItemListServico?: string;
  // NF-e 4.0
  indicadorEscalaRelevante?: string;
  // Preços e estoque
  costValue: number;
  lastCost: number;
  salePrice: number;
  minimumPrice: number;
  availableStock: number;
  minimumStock: number;
  maxStock: number;
  warehouse: string;
  allowNegativeStock: boolean;
  allowBackorder: boolean;
  ecommerceVisible: boolean;
};

export class ProductValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductValidationError";
  }
}

export function text(payload: ProductPayload, key: string, defaultValue = "") {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : defaultValue;
}

export function bool(payload: ProductPayload, key: string, defaultValue = false) {
  const value = payload[key];
  return typeof value === "boolean" ? value : defaultValue;
}

export function numeric(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value !== "string") {
    return 0;
  }

  return Number(value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
}

function numericOrUndefined(value: unknown): number | undefined {
  const n = numeric(value);
  return n !== 0 ? n : undefined;
}

function intOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = parseInt(value.trim(), 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

function productType(value: string): ValidatedProductInput["type"] {
  if (value === "Serviço" || value === "SERVICO") {
    return "SERVICO";
  }

  if (value === "Kit" || value === "KIT") {
    return "KIT";
  }

  if (value === "Insumo" || value === "INSUMO") {
    return "INSUMO";
  }

  return "PRODUTO";
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function validateProductPayload(payload: ProductPayload): ValidatedProductInput {
  const sku = text(payload, "sku").toUpperCase();
  const name = text(payload, "name");
  const ncm = onlyDigits(text(payload, "ncm"));
  const cest = onlyDigits(text(payload, "cest"));
  const barcode = onlyDigits(text(payload, "barcode"));
  const salePrice = numeric(payload.priceValue ?? payload.price);
  const costValue = numeric(payload.costValue);
  const availableStock = numeric(payload.availableStock);
  const minimumStock = numeric(payload.minimumStock);

  if (!sku) {
    throw new ProductValidationError("Informe o SKU do produto.");
  }

  if (!name) {
    throw new ProductValidationError("Informe o nome do produto.");
  }

  if (sku.length > 64) {
    throw new ProductValidationError("SKU deve ter no máximo 64 caracteres.");
  }

  if (ncm && ncm.length !== 8) {
    throw new ProductValidationError("NCM deve conter 8 dígitos.");
  }

  if (cest && cest.length !== 7) {
    throw new ProductValidationError("CEST deve conter 7 dígitos.");
  }

  if (barcode && ![8, 12, 13, 14].includes(barcode.length)) {
    throw new ProductValidationError("GTIN/EAN deve conter 8, 12, 13 ou 14 dígitos.");
  }

  if (salePrice < 0 || costValue < 0 || availableStock < 0 || minimumStock < 0) {
    throw new ProductValidationError("Valores e quantidades não podem ser negativos.");
  }

  return {
    sku,
    name,
    brand: text(payload, "brand", "JR Brasil") || "JR Brasil",
    category: text(payload, "category", "Sem categoria") || "Sem categoria",
    type: productType(text(payload, "type")),
    originalCode: text(payload, "originalCode") || undefined,
    manufacturerCode: text(payload, "supplierCode") || undefined,
    barcode: barcode || undefined,
    unit: text(payload, "unit", "UN") || "UN",
    purchaseUnit: text(payload, "purchaseUnit", "UN") || "UN",
    purchaseConversion: numeric(payload.purchaseConversion) || 1,
    shortDescription: text(payload, "shortDescription") || undefined,
    technicalDescription: text(payload, "technicalDescription") || undefined,
    storeDescription: text(payload, "storeDescription") || undefined,
    ncm: ncm || undefined,
    cest: cest || undefined,
    origin: text(payload, "origin") || undefined,
    cfopInState: text(payload, "cfopInState") || undefined,
    cfopOutState: text(payload, "cfopOutState") || undefined,
    taxRuleId: text(payload, "taxRuleId") || undefined,
    // ICMS
    icmsCST: text(payload, "icmsCst") || undefined,
    icmsCSOSN: text(payload, "icmsCsosn") || undefined,
    icmsModBC: intOrUndefined(payload.icmsModBC),
    icmsAliquota: numericOrUndefined(payload.icmsRate),
    icmsReducaoBC: numericOrUndefined(payload.icmsReducaoBC),
    // ICMS-ST
    icmsSTModBC: intOrUndefined(payload.icmsSTModBC),
    icmsSTMVA: numericOrUndefined(payload.icmsSTMVA),
    icmsSTReducaoBC: numericOrUndefined(payload.icmsSTReducaoBC),
    icmsSTAliquota: numericOrUndefined(payload.icmsSTAliquota),
    // FCP
    fcpAliquota: numericOrUndefined(payload.fcpAliquota),
    fcpSTAliquota: numericOrUndefined(payload.fcpSTAliquota),
    // IPI
    ipiCST: text(payload, "ipiCst") || undefined,
    ipiCodEnq: text(payload, "ipiCodEnq") || undefined,
    ipiAliquota: numericOrUndefined(payload.ipiRate),
    // PIS
    pisCST: text(payload, "pisCst") || undefined,
    pisAliquota: numericOrUndefined(payload.pisRate),
    // COFINS
    cofinsCST: text(payload, "cofinsCst") || undefined,
    cofinsAliquota: numericOrUndefined(payload.cofinsRate),
    // ISS
    issAliquota: numericOrUndefined(payload.issAliquota),
    issItemListServico: text(payload, "issItemListServico") || undefined,
    // NF-e 4.0
    indicadorEscalaRelevante: text(payload, "indicadorEscalaRelevante") || undefined,
    // Preços e estoque
    costValue,
    lastCost: numeric(payload.lastCost) || costValue,
    salePrice,
    minimumPrice: numeric(payload.minimumPrice),
    availableStock,
    minimumStock,
    maxStock: numeric(payload.maxStock),
    warehouse: text(payload, "warehouse", "Galpão LEM-1 · Estoque geral") || "Galpão LEM-1 · Estoque geral",
    allowNegativeStock: bool(payload, "allowNegativeStock"),
    allowBackorder: bool(payload, "allowBackorder"),
    ecommerceVisible: bool(payload, "ecommerceVisible", true)
  };
}

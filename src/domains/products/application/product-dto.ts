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
  ncm?: string;
  cest?: string;
  origin?: string;
  cfopInState?: string;
  cfopOutState?: string;
  taxRuleId?: string;
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
  /** Aplicação veicular (autopeças): em quais veículos a peça serve. */
  aplicacoes: Array<{ marca: string | null; modelo: string | null; anoFaixa: string | null; observacoes: string | null }>;
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
    ecommerceVisible: bool(payload, "ecommerceVisible", true),
    aplicacoes: parseAplicacoes(payload.aplicacoes)
  };
}

/** Normaliza as aplicações veiculares; descarta linhas totalmente vazias. */
function parseAplicacoes(value: unknown): ValidatedProductInput["aplicacoes"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const a = (raw ?? {}) as Record<string, unknown>;
      const limpar = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
      return {
        marca: limpar(a.marca),
        modelo: limpar(a.modelo),
        anoFaixa: limpar(a.anoFaixa),
        observacoes: limpar(a.observacoes)
      };
    })
    .filter((a) => a.marca || a.modelo || a.anoFaixa || a.observacoes);
}

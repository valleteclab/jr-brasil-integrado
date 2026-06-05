"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { correspondeBusca } from "@/lib/search/normalize";
import type { ErpProductSummary, ProductTaxRuleOption } from "@/lib/services/products";

function Pill({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={`pill ${tone}`}>
      <span className="dot" />
      {children}
    </span>
  );
}

type ProductRecord = ErpProductSummary & {
  originalCode: string;
  barcode: string;
  unit: string;
  type: string;
  shortDescription: string;
  technicalDescription: string;
  ncm: string;
  cest: string;
  origin: string;
  cfopInState: string;
  cfopOutState: string;
  taxRuleId: string;
  taxRuleName: string;
  icmsCst: string;
  icmsRate: string;
  ipiCst: string;
  ipiRate: string;
  pisCst: string;
  pisRate: string;
  cofinsCst: string;
  cofinsRate: string;
  costValue: string;
  lastCost: string;
  minimumPrice: string;
  maxDiscount: string;
  warehouse: string;
  location: string;
  reservedStock: string;
  maxStock: string;
  allowNegativeStock: boolean;
  allowBackorder: boolean;
  supplier: string;
  supplierCode: string;
  purchaseUnit: string;
  purchaseConversion: string;
  leadTime: string;
  minimumPurchase: string;
  storeTitle: string;
  storeDescription: string;
  showPrice: boolean;
  showStock: boolean;
  allowOnlineSale: boolean;
  allowQuote: boolean;
  seoSlug: string;
  applications: string;
  aplicacoes: AplicacaoVeicular[];
};

type AplicacaoVeicular = { marca: string; modelo: string; anoFaixa: string; observacoes: string };

type ProductFormState = {
  id?: string;
  priceValue: string;
  availableStock: string;
  minimumStock: string;
} & Omit<ProductRecord, "id" | "availableStock" | "minimumStock" | "price" | "status">;

type ProductCrudProps = {
  initialProducts: ErpProductSummary[];
  taxRules: ProductTaxRuleOption[];
  warehouses: string[];
  /** Ramo da empresa — habilita recursos específicos (AUTOPECAS → aplicação veicular). */
  segmento?: string;
};

type BadgeTone = "success" | "warn" | "danger" | "info" | "violet" | "mute";
type StockFilter = "todos" | "critico" | "zerado";
type ProductTab = "geral" | "fiscal" | "precos" | "estoque" | "compras" | "loja" | "aplicacoes";

const PAGE_SIZE = 20;

type XmlImportResult = {
  created: number;
  updated: number;
  invoice?: string;
  supplier?: string;
};

type FiscalEntryDraftItem = {
  importedProduct: ProductRecord;
  matchedProductId?: string;
  action: "create" | "update";
  confidence: number;
  review: boolean;
};

type FiscalEntryDraft = {
  id: string;
  invoice?: string;
  supplier?: string;
  status: "AGUARDANDO_CONFERENCIA";
  receivedAt: string;
  items: FiscalEntryDraftItem[];
};

const emptyForm: ProductFormState = {
  sku: "",
  name: "",
  brand: "",
  category: "",
  priceValue: "",
  availableStock: "0",
  minimumStock: "0",
  ecommerceVisible: true,
  originalCode: "",
  barcode: "",
  unit: "UN",
  type: "Peça",
  shortDescription: "",
  technicalDescription: "",
  ncm: "",
  cest: "",
  origin: "0 - Nacional",
  cfopInState: "",
  cfopOutState: "",
  taxRuleId: "",
  taxRuleName: "",
  icmsCst: "",
  icmsRate: "",
  ipiCst: "",
  ipiRate: "",
  pisCst: "",
  pisRate: "",
  cofinsCst: "",
  cofinsRate: "",
  costValue: "",
  lastCost: "",
  minimumPrice: "",
  maxDiscount: "",
  warehouse: "",
  location: "",
  reservedStock: "0",
  maxStock: "0",
  allowNegativeStock: false,
  allowBackorder: false,
  supplier: "",
  supplierCode: "",
  purchaseUnit: "UN",
  purchaseConversion: "1",
  leadTime: "",
  minimumPurchase: "",
  storeTitle: "",
  storeDescription: "",
  showPrice: true,
  showStock: true,
  allowOnlineSale: true,
  allowQuote: true,
  seoSlug: "",
  applications: "",
  aplicacoes: []
};

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency"
  }).format(value);
}

function parseCurrencyLabel(value: string) {
  return value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
}

function currencyToNumber(value: string) {
  return Number(parseCurrencyLabel(value)) || 0;
}

function stockStatus(availableStock: number, minimumStock: number): ErpProductSummary["status"] {
  if (availableStock <= 0) {
    return "Zerado";
  }

  if (minimumStock > 0 && availableStock <= minimumStock) {
    return "Crítico";
  }

  return "Em estoque";
}

function stockTone(status: string): BadgeTone {
  if (status === "Em estoque") {
    return "success";
  }

  if (status === "Crítico") {
    return "warn";
  }

  return "danger";
}

function enrichProduct(product: ErpProductSummary): ProductRecord {
  return {
    ...product,
    originalCode: product.originalCode ?? product.sku,
    barcode: product.barcode ?? "",
    unit: product.unit ?? "UN",
    type: product.type ?? "PRODUTO",
    shortDescription: product.shortDescription ?? product.name,
    technicalDescription: product.technicalDescription ?? "",
    ncm: product.ncm ?? "",
    cest: product.cest ?? "",
    origin: product.origin ?? "",
    cfopInState: product.cfopInState ?? "",
    cfopOutState: product.cfopOutState ?? "",
    taxRuleId: product.taxRuleId ?? "",
    taxRuleName: product.taxRuleName ?? "",
    icmsCst: "",
    icmsRate: "",
    ipiCst: "",
    ipiRate: "",
    pisCst: "",
    pisRate: "",
    cofinsCst: "",
    cofinsRate: "",
    costValue: product.costValue ?? "",
    lastCost: product.lastCost ?? "",
    minimumPrice: product.minimumPrice ?? "",
    maxDiscount: "",
    warehouse: product.warehouse ?? "",
    location: "",
    reservedStock: product.reservedStock ?? "0",
    maxStock: product.maxStock ?? "0",
    allowNegativeStock: product.allowNegativeStock ?? false,
    allowBackorder: product.allowBackorder ?? false,
    supplier: product.supplier ?? "",
    supplierCode: product.supplierCode ?? product.sku,
    purchaseUnit: product.purchaseUnit ?? "UN",
    purchaseConversion: product.purchaseConversion ?? "1",
    leadTime: "",
    minimumPurchase: "1",
    storeTitle: product.storeTitle ?? product.name,
    storeDescription: product.storeDescription ?? "",
    showPrice: true,
    showStock: true,
    allowOnlineSale: true,
    allowQuote: true,
    seoSlug: product.sku.toLowerCase(),
    applications: "",
    aplicacoes: product.aplicacoes ?? []
  };
}

function toForm(product: ProductRecord): ProductFormState {
  return {
    ...product,
    priceValue: parseCurrencyLabel(product.price),
    availableStock: String(product.availableStock),
    minimumStock: String(product.minimumStock)
  };
}

function toProduct(form: ProductFormState): ProductRecord {
  const availableStock = Number(form.availableStock) || 0;
  const minimumStock = Number(form.minimumStock) || 0;
  const priceValue = Number(form.priceValue.replace(",", ".")) || 0;
  const sku = form.sku.trim().toUpperCase();
  const name = form.name.trim();

  return {
    ...form,
    id: form.id ?? `local-${Date.now()}`,
    sku,
    name,
    brand: form.brand.trim() || "JR Brasil",
    category: form.category.trim() || "Sem categoria",
    price: formatBrl(priceValue),
    availableStock,
    minimumStock,
    status: stockStatus(availableStock, minimumStock),
    ecommerceVisible: form.ecommerceVisible,
    storeTitle: form.storeTitle || name,
    seoSlug: form.seoSlug || sku.toLowerCase()
  };
}

export function ProductCrud({ initialProducts, taxRules, warehouses, segmento }: ProductCrudProps) {
  const isAutopecas = segmento === "AUTOPECAS";
  const defaultWarehouse = warehouses[0] ?? "";
  const initialRecords = useMemo(() => initialProducts.map(enrichProduct), [initialProducts]);
  const xmlInputRef = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState<ProductRecord[]>(initialRecords);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [error, setError] = useState("");
  const [importResult, setImportResult] = useState<XmlImportResult | null>(null);
  const [fiscalEntryDraft, setFiscalEntryDraft] = useState<FiscalEntryDraft | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ProductTab>("geral");
  const [query, setQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("todos");
  const [categoryFilter, setCategoryFilter] = useState("todas");
  const [brandFilter, setBrandFilter] = useState("todas");
  const [currentPage, setCurrentPage] = useState(1);

  const editing = Boolean(form.id);

  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.category))).sort(),
    [products]
  );
  const brands = useMemo(
    () => Array.from(new Set(products.map((product) => product.brand))).sort(),
    [products]
  );

  const counts = useMemo(() => ({
    todos: products.length,
    critico: products.filter((product) => product.status === "Crítico").length,
    zerado: products.filter((product) => product.status === "Zerado").length
  }), [products]);

  const totals = useMemo(() => {
    const sale = products.reduce(
      (total, product) => total + currencyToNumber(product.price) * product.availableStock,
      0
    );
    const cost = products.reduce(
      (total, product) => total + currencyToNumber(product.costValue) * product.availableStock,
      0
    );

    return { cost, sale };
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products
      .filter((product) =>
        correspondeBusca(
          query,
          product.sku, product.name, product.brand, product.category, product.originalCode, product.barcode, product.supplierCode,
          // Aplicação veicular: permite achar a peça pelo veículo ("gol", "palio 2010"...).
          ...(product.aplicacoes ?? []).map((a) => `${a.marca} ${a.modelo} ${a.anoFaixa} ${a.observacoes}`)
        )
      )
      .filter((product) => {
        if (stockFilter === "todos") {
          return true;
        }

        if (stockFilter === "critico") {
          return product.status === "Crítico";
        }

        return product.status === "Zerado";
      })
      .filter((product) => categoryFilter === "todas" || product.category === categoryFilter)
      .filter((product) => brandFilter === "todas" || product.brand === brandFilter)
      .sort((a, b) => a.sku.localeCompare(b.sku));
  }, [brandFilter, categoryFilter, products, query, stockFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredProducts.slice(start, start + PAGE_SIZE);
  }, [currentPage, filteredProducts]);

  useEffect(() => {
    setCurrentPage(1);
  }, [brandFilter, categoryFilter, query, stockFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  function updateField<Key extends keyof ProductFormState>(key: Key, value: ProductFormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  // Aplicação veicular (autopeças): lista editável de "que veículo a peça serve".
  function addAplicacao() {
    setForm((cur) => ({ ...cur, aplicacoes: [...cur.aplicacoes, { marca: "", modelo: "", anoFaixa: "", observacoes: "" }] }));
  }
  function updateAplicacao(index: number, patch: Partial<AplicacaoVeicular>) {
    setForm((cur) => ({ ...cur, aplicacoes: cur.aplicacoes.map((a, i) => (i === index ? { ...a, ...patch } : a)) }));
  }
  function removeAplicacao(index: number) {
    setForm((cur) => ({ ...cur, aplicacoes: cur.aplicacoes.filter((_, i) => i !== index) }));
  }

  function closeDrawer() {
    setForm(emptyForm);
    setError("");
    setDrawerOpen(false);
    setActiveTab("geral");
  }

  function openNewProduct() {
    setForm({ ...emptyForm, warehouse: defaultWarehouse });
    setError("");
    setActiveTab("geral");
    setDrawerOpen(true);
  }

  async function persistProduct(product: ProductRecord, productId?: string) {
    const response = await fetch(productId ? `/api/erp/produtos/${productId}` : "/api/erp/produtos", {
      body: JSON.stringify(product),
      headers: { "Content-Type": "application/json" },
      method: productId ? "PUT" : "POST"
    });
    const data = await response.json() as { id?: string; error?: string };

    if (!response.ok) {
      throw new Error(data.error || "Não foi possível salvar o produto.");
    }

    return data.id || productId || product.id;
  }

  async function saveProduct() {
    const product = toProduct(form);

    if (!product.sku || !product.name) {
      setError("Informe SKU e nome do produto.");
      setActiveTab("geral");
      return;
    }

    const duplicateSku = products.some((item) => item.sku === product.sku && item.id !== product.id);

    if (duplicateSku) {
      setError("Já existe um produto com este SKU.");
      setActiveTab("geral");
      return;
    }

    try {
      const savedId = await persistProduct(product, editing ? product.id : undefined);
      const savedProduct = { ...product, id: savedId };

      setProducts((current) => {
        if (editing) {
          return current.map((item) => (item.id === savedProduct.id ? savedProduct : item));
        }

        return [savedProduct, ...current];
      });
      closeDrawer();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Não foi possível salvar o produto.";
      setError(message);
    }
  }

  function editProduct(product: ProductRecord) {
    setForm(toForm(product));
    setError("");
    setActiveTab("geral");
    setDrawerOpen(true);
  }

  async function deleteProduct(productId: string) {
    const confirmed = window.confirm("Excluir este produto?");

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/erp/produtos/${productId}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível excluir o produto.");
      }

      setProducts((current) => current.filter((product) => product.id !== productId));

      if (form.id === productId) {
        closeDrawer();
      }
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Não foi possível excluir o produto.";
      setError(message);
    }
  }

  function resetProducts() {
    setProducts(initialRecords);
    closeDrawer();
    setImportResult(null);
    setFiscalEntryDraft(null);
  }

  function findProductMatch(importedProduct: ProductRecord) {
    const barcode = importedProduct.barcode.trim();
    const sku = importedProduct.sku.trim().toUpperCase();

    const bySku = products.find((product) => product.sku.toUpperCase() === sku);

    if (bySku) {
      return { product: bySku, confidence: 100 };
    }

    if (barcode) {
      const byBarcode = products.find((product) => product.barcode.trim() === barcode);

      if (byBarcode) {
        return { product: byBarcode, confidence: 92 };
      }
    }

    const bySupplierCode = products.find(
      (product) => product.supplierCode.trim().toUpperCase() === sku || product.originalCode.trim().toUpperCase() === sku
    );

    if (bySupplierCode) {
      return { product: bySupplierCode, confidence: 85 };
    }

    return null;
  }

  async function importXml(file: File) {
    const xmlText = await file.text();
    const response = await fetch("/api/erp/entradas-fiscais/xml", {
      body: JSON.stringify({ xmlText }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const data = await response.json() as FiscalEntryDraft & { error?: string };

    if (!response.ok) {
      throw new Error(data.error || "Não foi possível importar o XML.");
    }

    setFiscalEntryDraft(data);
    setImportResult(null);
  }

  async function processFiscalEntry() {
    if (!fiscalEntryDraft) {
      return;
    }

    try {
      const response = await fetch(`/api/erp/entradas-fiscais/${fiscalEntryDraft.id}/processar`, { method: "POST" });
      const data = await response.json() as { created?: number; updated?: number; error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível processar a entrada fiscal.");
      }

      setImportResult({
        created: data.created ?? 0,
        updated: data.updated ?? 0,
        invoice: fiscalEntryDraft.invoice,
        supplier: fiscalEntryDraft.supplier
      });
      setFiscalEntryDraft(null);
      window.location.reload();
    } catch (entryError) {
      const message = entryError instanceof Error ? entryError.message : "Não foi possível processar a entrada fiscal.";
      setError(message);
    }
  }

  async function handleXmlChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      await importXml(file);
      setError("");
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : "Não foi possível importar o XML.";
      setError(message);
    } finally {
      event.target.value = "";
    }
  }

  function renderTab() {
    if (activeTab === "geral") {
      return (
        <div className="erp-form">
          <label>
            SKU interno
            <input value={form.sku} onChange={(event) => updateField("sku", event.target.value)} />
          </label>
          <label>
            Código original
            <input value={form.originalCode} onChange={(event) => updateField("originalCode", event.target.value)} />
          </label>
          <label>
            GTIN / EAN
            <input value={form.barcode} onChange={(event) => updateField("barcode", event.target.value)} />
          </label>
          <label className="full">
            Nome do produto
            <input value={form.name} onChange={(event) => updateField("name", event.target.value)} />
          </label>
          <label>
            Marca
            <input value={form.brand} onChange={(event) => updateField("brand", event.target.value)} />
          </label>
          <label>
            Categoria
            <input value={form.category} onChange={(event) => updateField("category", event.target.value)} />
          </label>
          <label>
            Tipo
            <select value={form.type} onChange={(event) => updateField("type", event.target.value)}>
              <option>Peça</option>
              <option>Serviço</option>
              <option>Kit</option>
              <option>Insumo</option>
            </select>
          </label>
          <label>
            Unidade
            <select value={form.unit} onChange={(event) => updateField("unit", event.target.value)}>
              <option>UN</option>
              <option>PAR</option>
              <option>CX</option>
              <option>KG</option>
              <option>MT</option>
            </select>
          </label>
          <label className="full">
            Descrição curta
            <input value={form.shortDescription} onChange={(event) => updateField("shortDescription", event.target.value)} />
          </label>
          <label className="full">
            Descrição técnica
            <textarea value={form.technicalDescription} onChange={(event) => updateField("technicalDescription", event.target.value)} />
          </label>
        </div>
      );
    }

    if (activeTab === "fiscal") {
      return (
        <div className="erp-form">
          <label>
            NCM
            <input value={form.ncm} onChange={(event) => updateField("ncm", event.target.value)} />
          </label>
          <label>
            CEST
            <input value={form.cest} onChange={(event) => updateField("cest", event.target.value)} />
          </label>
          <label>
            Origem
            <input value={form.origin} onChange={(event) => updateField("origin", event.target.value)} />
          </label>
          <label>
            CFOP dentro do estado
            <input value={form.cfopInState} onChange={(event) => updateField("cfopInState", event.target.value)} />
          </label>
          <label>
            CFOP fora do estado
            <input value={form.cfopOutState} onChange={(event) => updateField("cfopOutState", event.target.value)} />
          </label>
          <label className="full">
            Regra tributária para emissão
            <select
              value={form.taxRuleId}
              onChange={(event) => {
                const selectedRule = taxRules.find((rule) => rule.id === event.target.value);
                setForm((current) => ({
                  ...current,
                  taxRuleId: event.target.value,
                  taxRuleName: selectedRule?.name ?? ""
                }));
              }}
            >
              <option value="">Sem regra tributária vinculada</option>
              {taxRules.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.name} · {rule.tax} · {rule.operation}{rule.cfop ? ` · CFOP ${rule.cfop}` : ""}{rule.ncm ? ` · NCM ${rule.ncm}` : ""}
                </option>
              ))}
            </select>
            {!taxRules.length && <small className="field-hint">Cadastre regras tributárias antes de emitir NF-e.</small>}
          </label>
          <label>
            CST/CSOSN ICMS
            <input value={form.icmsCst} onChange={(event) => updateField("icmsCst", event.target.value)} />
          </label>
          <label>
            ICMS %
            <input value={form.icmsRate} onChange={(event) => updateField("icmsRate", event.target.value)} />
          </label>
          <label>
            CST IPI
            <input value={form.ipiCst} onChange={(event) => updateField("ipiCst", event.target.value)} />
          </label>
          <label>
            IPI %
            <input value={form.ipiRate} onChange={(event) => updateField("ipiRate", event.target.value)} />
          </label>
          <label>
            CST PIS
            <input value={form.pisCst} onChange={(event) => updateField("pisCst", event.target.value)} />
          </label>
          <label>
            PIS %
            <input value={form.pisRate} onChange={(event) => updateField("pisRate", event.target.value)} />
          </label>
          <label>
            CST COFINS
            <input value={form.cofinsCst} onChange={(event) => updateField("cofinsCst", event.target.value)} />
          </label>
          <label>
            COFINS %
            <input value={form.cofinsRate} onChange={(event) => updateField("cofinsRate", event.target.value)} />
          </label>
        </div>
      );
    }

    if (activeTab === "precos") {
      return (
        <div className="erp-form">
          <label>
            Custo médio
            <input value={form.costValue} onChange={(event) => updateField("costValue", event.target.value)} />
          </label>
          <label>
            Último custo
            <input value={form.lastCost} onChange={(event) => updateField("lastCost", event.target.value)} />
          </label>
          <label>
            Preço de venda
            <input value={form.priceValue} onChange={(event) => updateField("priceValue", event.target.value)} />
          </label>
          <label>
            Preço mínimo
            <input value={form.minimumPrice} onChange={(event) => updateField("minimumPrice", event.target.value)} />
          </label>
          <label>
            Desconto máximo %
            <input value={form.maxDiscount} onChange={(event) => updateField("maxDiscount", event.target.value)} />
          </label>
        </div>
      );
    }

    if (activeTab === "estoque") {
      return (
        <div className="erp-form">
          <label>
            Depósito padrão
            <input list="produto-depositos" value={form.warehouse} onChange={(event) => updateField("warehouse", event.target.value)} />
            <datalist id="produto-depositos">
              {warehouses.map((nome) => (
                <option key={nome} value={nome} />
              ))}
            </datalist>
          </label>
          <label>
            Endereço físico
            <input value={form.location} onChange={(event) => updateField("location", event.target.value)} />
          </label>
          <label>
            Estoque físico
            <input value={form.availableStock} onChange={(event) => updateField("availableStock", event.target.value)} />
          </label>
          <label>
            Reservado
            <input value={form.reservedStock} onChange={(event) => updateField("reservedStock", event.target.value)} />
          </label>
          <label>
            Estoque mínimo
            <input value={form.minimumStock} onChange={(event) => updateField("minimumStock", event.target.value)} />
          </label>
          <label>
            Estoque máximo
            <input value={form.maxStock} onChange={(event) => updateField("maxStock", event.target.value)} />
          </label>
          <label className="check-row">
            <input checked={form.allowNegativeStock} type="checkbox" onChange={(event) => updateField("allowNegativeStock", event.target.checked)} />
            Permitir estoque negativo
          </label>
          <label className="check-row">
            <input checked={form.allowBackorder} type="checkbox" onChange={(event) => updateField("allowBackorder", event.target.checked)} />
            Permitir venda sob encomenda
          </label>
        </div>
      );
    }

    if (activeTab === "compras") {
      return (
        <div className="erp-form">
          <label>
            Fornecedor principal
            <input value={form.supplier} onChange={(event) => updateField("supplier", event.target.value)} />
          </label>
          <label>
            Código no fornecedor
            <input value={form.supplierCode} onChange={(event) => updateField("supplierCode", event.target.value)} />
          </label>
          <label>
            Unidade de compra
            <input value={form.purchaseUnit} onChange={(event) => updateField("purchaseUnit", event.target.value)} />
          </label>
          <label>
            Fator de conversão
            <input value={form.purchaseConversion} onChange={(event) => updateField("purchaseConversion", event.target.value)} />
          </label>
          <label>
            Lead time em dias
            <input value={form.leadTime} onChange={(event) => updateField("leadTime", event.target.value)} />
          </label>
          <label>
            Compra mínima
            <input value={form.minimumPurchase} onChange={(event) => updateField("minimumPurchase", event.target.value)} />
          </label>
        </div>
      );
    }

    if (activeTab === "aplicacoes") {
      return (
        <div className="produto-aplicacoes">
          <p className="block-muted">
            Em quais veículos esta peça serve. Aparece na busca (o balconista acha pelo carro) e na ficha do produto.
          </p>
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead><tr><th>Montadora</th><th>Modelo</th><th>Anos</th><th>Observação</th><th></th></tr></thead>
              <tbody>
                {form.aplicacoes.length === 0 && (
                  <tr><td colSpan={5} className="block-muted">Nenhuma aplicação. Clique em “Adicionar veículo”.</td></tr>
                )}
                {form.aplicacoes.map((a, i) => (
                  <tr key={i}>
                    <td><input value={a.marca} onChange={(e) => updateAplicacao(i, { marca: e.target.value })} placeholder="Ex.: VW" /></td>
                    <td><input value={a.modelo} onChange={(e) => updateAplicacao(i, { modelo: e.target.value })} placeholder="Ex.: Gol" /></td>
                    <td><input value={a.anoFaixa} onChange={(e) => updateAplicacao(i, { anoFaixa: e.target.value })} placeholder="Ex.: 2008-2014" /></td>
                    <td><input value={a.observacoes} onChange={(e) => updateAplicacao(i, { observacoes: e.target.value })} placeholder="Ex.: motor 1.0" /></td>
                    <td><button type="button" className="btn-erp light sm" onClick={() => removeAplicacao(i)}>Remover</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn-erp light sm" style={{ marginTop: 10 }} onClick={addAplicacao}>+ Adicionar veículo</button>
        </div>
      );
    }

    return (
      <div className="erp-form">
        <label className="full">
          Título na loja
          <input value={form.storeTitle} onChange={(event) => updateField("storeTitle", event.target.value)} />
        </label>
        <label className="full">
          Descrição comercial
          <textarea value={form.storeDescription} onChange={(event) => updateField("storeDescription", event.target.value)} />
        </label>
        <label>
          Slug
          <input value={form.seoSlug} onChange={(event) => updateField("seoSlug", event.target.value)} />
        </label>
        <label className="full">
          Aplicações e compatibilidades
          <textarea value={form.applications} onChange={(event) => updateField("applications", event.target.value)} />
        </label>
        <label className="check-row">
          <input checked={form.ecommerceVisible} type="checkbox" onChange={(event) => updateField("ecommerceVisible", event.target.checked)} />
          Visível na loja
        </label>
        <label className="check-row">
          <input checked={form.showPrice} type="checkbox" onChange={(event) => updateField("showPrice", event.target.checked)} />
          Mostrar preço
        </label>
        <label className="check-row">
          <input checked={form.showStock} type="checkbox" onChange={(event) => updateField("showStock", event.target.checked)} />
          Mostrar estoque
        </label>
        <label className="check-row">
          <input checked={form.allowOnlineSale} type="checkbox" onChange={(event) => updateField("allowOnlineSale", event.target.checked)} />
          Permitir compra online
        </label>
        <label className="check-row">
          <input checked={form.allowQuote} type="checkbox" onChange={(event) => updateField("allowQuote", event.target.checked)} />
          Permitir orçamento
        </label>
      </div>
    );
  }

  return (
    <>
      <div className="erp-page-actions product-actions">
        <button type="button" className="btn-erp ghost sm">Exportar</button>
        <a className="btn-erp ghost sm" href="/erp/entradas-fiscais/nova">Nova entrada NF-e</a>
        <input
          accept=".xml,text/xml,application/xml"
          className="sr-only-file"
          onChange={handleXmlChange}
          ref={xmlInputRef}
          type="file"
        />
        <button type="button" className="btn-erp primary sm" onClick={openNewProduct}>+ Novo produto</button>
      </div>

      {importResult && (
        <div className="alert info product-import-alert">
          <strong>Entrada fiscal processada</strong>
          <span>
            {importResult.created} produto(s) novo(s), {importResult.updated} atualizado(s)
            {importResult.invoice ? ` · NF-e ${importResult.invoice}` : ""}
            {importResult.supplier ? ` · ${importResult.supplier}` : ""}
          </span>
        </div>
      )}

      {error && !drawerOpen && <div className="alert danger product-import-alert"><strong>Atenção</strong><span>{error}</span></div>}

      {fiscalEntryDraft && (
        <section className="fiscal-entry-review">
          <header>
            <div>
              <span className="section-kicker">Entrada fiscal</span>
              <h2>NF-e em conferência</h2>
              <p>
                {fiscalEntryDraft.invoice ? `NF-e ${fiscalEntryDraft.invoice}` : "Nota sem número identificado"}
                {fiscalEntryDraft.supplier ? ` · ${fiscalEntryDraft.supplier}` : ""}
              </p>
            </div>
            <div className="fiscal-entry-actions">
              <button type="button" className="btn-erp ghost sm" onClick={() => setFiscalEntryDraft(null)}>Cancelar entrada</button>
              <button type="button" className="btn-erp primary sm" onClick={processFiscalEntry}>Processar entrada</button>
            </div>
          </header>
          <div className="erp-table-wrap fiscal-entry-table">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Item XML</th>
                  <th>Produto vinculado</th>
                  <th className="num">Qtd.</th>
                  <th className="num">Custo unit.</th>
                  <th>Fiscal</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {fiscalEntryDraft.items.map((item) => {
                  const matchedProduct = item.matchedProductId
                    ? products.find((product) => product.id === item.matchedProductId)
                    : undefined;

                  return (
                    <tr key={`${item.importedProduct.sku}-${item.importedProduct.name}`}>
                      <td>
                        <div className="product-cell">
                          <span className="product-thumb">NF</span>
                          <span>
                            <strong>{item.importedProduct.name}</strong>
                            <small>{item.importedProduct.sku} · {item.importedProduct.unit}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        {matchedProduct ? (
                          <span>
                            <strong>{matchedProduct.name}</strong>
                            <small className="block-muted">SKU {matchedProduct.sku} · confiança {item.confidence}%</small>
                          </span>
                        ) : (
                          <span>
                            <strong>Novo cadastro</strong>
                            <small className="block-muted">Sem vínculo automático seguro</small>
                          </span>
                        )}
                      </td>
                      <td className="num">{item.importedProduct.availableStock} {item.importedProduct.unit}</td>
                      <td className="num">{item.importedProduct.costValue}</td>
                      <td>
                        <span className="category-pill">NCM {item.importedProduct.ncm || "não informado"}</span>
                        <small className="block-muted">CFOP {item.importedProduct.cfopInState || "não informado"}</small>
                      </td>
                      <td>
                        <Pill tone={item.review ? "warn" : "success"}>
                          {item.review ? "Revisar vínculo" : item.action === "update" ? "Vinculado" : "Criar produto"}
                        </Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="erp-products">
        <div className="erp-toolbar product-toolbar">
          <div className="toolbar-search">
            <span className="ic-sr" aria-hidden="true">⌕</span>
            <input
              className="search"
              placeholder="Código, nome, marca..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="stat-pills">
            <button className={`stat-pill${stockFilter === "todos" ? " active" : ""}`} type="button" onClick={() => setStockFilter("todos")}>
              Todos <span className="num">{counts.todos}</span>
            </button>
            <button className={`stat-pill${stockFilter === "critico" ? " active" : ""}`} type="button" onClick={() => setStockFilter("critico")}>
              Crítico <span className="num">{counts.critico}</span>
            </button>
            <button className={`stat-pill${stockFilter === "zerado" ? " active" : ""}`} type="button" onClick={() => setStockFilter("zerado")}>
              Zerado <span className="num">{counts.zerado}</span>
            </button>
          </div>
          <button className="btn-erp link" type="button" onClick={resetProducts}>Restaurar cadastro inicial</button>
          <div className="grow" />
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="todas">Categoria: todas</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
            <option value="todas">Marca: todas</option>
            {brands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
          </select>
        </div>

        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th className="check"><input type="checkbox" aria-label="Selecionar todos" /></th>
                <th>SKU</th>
                <th>Produto</th>
                <th>Categoria</th>
                <th>Marca</th>
                <th className="num">Custo médio</th>
                <th className="num">Preço venda</th>
                <th className="num">Margem</th>
                <th className="num">Estoque</th>
                <th className="num">Mínimo</th>
                <th>Status</th>
                <th className="actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.map((product) => {
                const salePrice = currencyToNumber(product.price);
                const costPrice = currencyToNumber(product.costValue);
                const margin = salePrice > 0 ? ((salePrice - costPrice) / salePrice) * 100 : 0;

                return (
                  <tr key={product.id}>
                    <td className="check"><input type="checkbox" aria-label={`Selecionar ${product.sku}`} /></td>
                    <td className="mono bold">{product.sku}</td>
                    <td>
                      <div className="product-cell">
                        <span className="product-thumb">⊙</span>
                        <span>
                          <strong>{product.name}</strong>
                          <small>Cód. {product.originalCode || product.sku}</small>
                        </span>
                      </div>
                    </td>
                    <td><span className="category-pill">{product.category}</span></td>
                    <td>{product.brand}</td>
                    <td className="num">{formatBrl(costPrice)}</td>
                    <td className="num">{product.price}</td>
                    <td className="num margin-ok">{margin.toFixed(1)}%</td>
                    <td className={`num ${product.status === "Crítico" ? "stock-warn" : ""}`}>{product.availableStock} un.</td>
                    <td className="num">{product.minimumStock}</td>
                    <td><Pill tone={stockTone(product.status)}>{product.status}</Pill></td>
                    <td className="actions">
                      <button type="button" className="btn-erp ghost xs" onClick={() => editProduct(product)}>Abrir</button>
                      <button type="button" className="btn-erp danger xs" onClick={() => deleteProduct(product.id)}>Excluir</button>
                    </td>
                  </tr>
                );
              })}
              {!paginatedProducts.length && (
                <tr>
                  <td colSpan={12}>
                    <div className="empty-st">
                      <h4>Nenhum produto encontrado</h4>
                      <p>Ajuste a busca ou os filtros selecionados.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="erp-table-foot">
            <span>
              {filteredProducts.length} SKUs exibidos · Estoque a custo: {formatBrl(totals.cost)} · Estoque a preço de venda: {formatBrl(totals.sale)}
            </span>
            {totalPages > 1 && (
              <div className="pagi">
                <button
                  type="button"
                  aria-label="Página anterior"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                >
                  ‹
                </button>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                  <button
                    className={currentPage === page ? "active" : ""}
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="Próxima página"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {drawerOpen && (
        <>
          <div className="drawer-bd" onClick={closeDrawer} />
          <aside className="drawer product-drawer" aria-label="Cadastro de produto">
            <header className="drawer-head">
              <div>
                <h2>{editing ? "Editar produto" : "Novo produto"}</h2>
                <p>{form.sku || "Informe os dados principais para criar o SKU"}</p>
              </div>
              <button type="button" className="btn-erp ghost xs" onClick={closeDrawer}>Fechar</button>
            </header>
            <nav className="tabs">
              {[
                ["geral", "Geral"],
                ["fiscal", "Fiscal"],
                ["precos", "Preços e custos"],
                ["estoque", "Estoque"],
                ["compras", "Compras"],
                ["loja", "Loja B2B"],
                ...(isAutopecas ? [["aplicacoes", "Aplicação veicular"]] : [])
              ].map(([tab, label]) => (
                <button
                  className={activeTab === tab ? "active" : ""}
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab as ProductTab)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <div className="drawer-body">
              {renderTab()}
              {error && <p className="form-error drawer-error">{error}</p>}
            </div>
            <footer className="drawer-foot">
              <button type="button" className="btn-erp ghost sm" onClick={closeDrawer}>Cancelar</button>
              <button type="button" className="btn-erp primary sm" onClick={saveProduct}>{editing ? "Salvar alterações" : "Cadastrar produto"}</button>
            </footer>
          </aside>
        </>
      )}
    </>
  );
}

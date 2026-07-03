"use client";

import { useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Button } from "@/components/shared/Button";
import type { ProductPickerOption } from "@/lib/services/products";

type WizardStep = 1 | 2 | 3 | 4;

type FiscalDraftItem = {
  id: string;
  importedProduct: {
    sku: string;
    name: string;
    unit: string;
    availableStock: number;
    costValue: string;
    price: string;
    ncm: string;
    cfopInState: string;
  };
  matchedProductId?: string;
  action: "create" | "update";
  confidence: number;
  review: boolean;
  /** Preço de venda À VISTA do novo SKU. */
  salePrice?: string;
  /** Preço de venda A PRAZO do novo SKU (opcional; sem ele vale o à vista). */
  salePriceTerm?: string;
  /** Margens (%) sobre o custo digitadas na conferência — só para calcular os preços na tela. */
  marginCash?: string;
  marginTerm?: string;
  minimumPrice?: string;
  brand?: string;
  /** Conversão de embalagem: unidades de venda por unidade de compra (1 CX = 12 UN ⇒ 12). */
  fatorConversao?: number;
  /** Unidade de venda alvo quando há conversão (ex.: UN). */
  unidadeVenda?: string;
  finalidade?: FinalidadeEntrada;
  finalidadeOrigem?: string;
  cfopEntradaDerivado?: string;
  movimentaEstoque?: boolean;
  impostos?: Array<{
    tributo: string;
    cst: string | null;
    csosn: string | null;
    base: number;
    aliquota: number;
    valor: number;
    /** Crédito de ICMS de fornecedor do Simples (LC 123, art. 23). */
    credSnAliquota?: number;
    credSnValor?: number;
  }>;
};

type FinalidadeEntrada =
  | "REVENDA" | "USO_CONSUMO" | "IMOBILIZADO" | "INDUSTRIALIZACAO"
  | "DEVOLUCAO_VENDA" | "TRANSFERENCIA" | "RETORNO_INDUSTRIALIZACAO" | "BONIFICACAO"
  | "MATERIAL_SERVICO_ICMS" | "MATERIAL_SERVICO_ISS" | "COMBUSTIVEL_LUBRIFICANTE";

const FINALIDADE_OPCOES: Array<{ value: FinalidadeEntrada; label: string }> = [
  { value: "REVENDA", label: "Revenda" },
  { value: "USO_CONSUMO", label: "Uso e consumo" },
  { value: "IMOBILIZADO", label: "Imobilizado" },
  { value: "INDUSTRIALIZACAO", label: "Industrialização" },
  { value: "DEVOLUCAO_VENDA", label: "Devolução de venda" },
  { value: "TRANSFERENCIA", label: "Transferência (filiais)" },
  { value: "RETORNO_INDUSTRIALIZACAO", label: "Retorno de industrialização" },
  { value: "BONIFICACAO", label: "Bonificação / brinde" },
  { value: "MATERIAL_SERVICO_ICMS", label: "Material p/ serviço c/ ICMS (2.126)" },
  { value: "MATERIAL_SERVICO_ISS", label: "Material p/ serviço c/ ISS (2.128)" },
  { value: "COMBUSTIVEL_LUBRIFICANTE", label: "Combustível / lubrificante (1.653)" }
];

const FINALIDADE_ORIGEM_LABEL: Record<string, string> = {
  PRODUTO_FISCAL: "memória do produto",
  DEPARA: "regra De/Para",
  HEURISTICA: "heurística",
  MANUAL: "manual",
  IA: "IA"
};

// CFOP de entrada por finalidade (espelha src/domains/fiscal/finalidade-entrada.ts) para
// recalcular o CFOP exibido ao trocar a finalidade no cliente. O eixo interno/interestadual
// é preservado do CFOP já derivado no servidor.
const CFOP_ENTRADA_CLIENT: Record<FinalidadeEntrada, { semSt: [string, string]; comSt: [string, string] }> = {
  REVENDA: { semSt: ["1102", "2102"], comSt: ["1403", "2403"] },
  INDUSTRIALIZACAO: { semSt: ["1101", "2101"], comSt: ["1401", "2401"] },
  USO_CONSUMO: { semSt: ["1556", "2556"], comSt: ["1407", "2407"] },
  IMOBILIZADO: { semSt: ["1551", "2551"], comSt: ["1406", "2406"] },
  DEVOLUCAO_VENDA: { semSt: ["1202", "2202"], comSt: ["1411", "2411"] },
  TRANSFERENCIA: { semSt: ["1152", "2152"], comSt: ["1408", "2408"] },
  RETORNO_INDUSTRIALIZACAO: { semSt: ["1902", "2902"], comSt: ["1902", "2902"] },
  BONIFICACAO: { semSt: ["1910", "2910"], comSt: ["1910", "2910"] },
  MATERIAL_SERVICO_ICMS: { semSt: ["1126", "2126"], comSt: ["1126", "2126"] },
  MATERIAL_SERVICO_ISS: { semSt: ["1128", "2128"], comSt: ["1128", "2128"] },
  COMBUSTIVEL_LUBRIFICANTE: { semSt: ["1653", "2653"], comSt: ["1653", "2653"] }
};

function recalcCfopEntrada(finalidade: FinalidadeEntrada, cfopAtual: string | undefined): string {
  const interestadual = (cfopAtual ?? "").startsWith("2");
  const comSt = ["1403", "2403", "1401", "2401", "1407", "2407", "1406", "2406", "1411", "2411", "1408", "2408"].includes(cfopAtual ?? "");
  const par = comSt ? CFOP_ENTRADA_CLIENT[finalidade].comSt : CFOP_ENTRADA_CLIENT[finalidade].semSt;
  return par[interestadual ? 1 : 0];
}

// CFOPs de entrada especiais (fora da matriz das 4 finalidades), oferecidos como atalho no campo
// editável. 1xxx = mesmo estado, 2xxx = outro estado, 3xxx = exterior (importação).
const CFOP_ENTRADA_ESPECIAIS: Array<{ code: string; label: string }> = [
  { code: "1126", label: "Compra p/ uso na prestação de serviço sujeita ao ICMS (mesmo estado)" },
  { code: "2126", label: "Compra p/ uso na prestação de serviço sujeita ao ICMS (outro estado)" },
  { code: "1128", label: "Compra p/ uso na prestação de serviço sujeita ao ISSQN (mesmo estado)" },
  { code: "2128", label: "Compra p/ uso na prestação de serviço sujeita ao ISSQN (outro estado)" },
  { code: "1124", label: "Industrialização efetuada por outra empresa (mesmo estado)" },
  { code: "2124", label: "Industrialização efetuada por outra empresa (outro estado)" },
  { code: "1202", label: "Devolução de venda (mesmo estado)" },
  { code: "2202", label: "Devolução de venda (outro estado)" },
  { code: "1411", label: "Devolução de venda com ST (mesmo estado)" },
  { code: "2411", label: "Devolução de venda com ST (outro estado)" },
  { code: "1915", label: "Entrada para conserto/reparo (mesmo estado)" },
  { code: "2915", label: "Entrada para conserto/reparo (outro estado)" },
  { code: "1916", label: "Retorno de conserto/reparo (mesmo estado)" },
  { code: "2916", label: "Retorno de conserto/reparo (outro estado)" },
  { code: "1152", label: "Transferência de mercadoria (mesmo estado)" },
  { code: "2152", label: "Transferência de mercadoria (outro estado)" },
  { code: "1910", label: "Entrada de bonificação/brinde/doação (mesmo estado)" },
  { code: "2910", label: "Entrada de bonificação/brinde/doação (outro estado)" },
  { code: "1949", label: "Outra entrada não especificada (mesmo estado)" },
  { code: "2949", label: "Outra entrada não especificada (outro estado)" },
  { code: "3102", label: "Importação do exterior para revenda" },
  { code: "3101", label: "Importação do exterior para industrialização" },
  { code: "3551", label: "Importação do exterior para o ativo imobilizado" },
  { code: "3556", label: "Importação do exterior para uso e consumo" }
];

type FiscalDraft = {
  id: string;
  invoice?: string;
  supplier?: string;
  accessKey?: string;
  series?: string;
  model?: string;
  issuedAt?: string | null;
  supplierDocument?: string;
  mainCfop?: string;
  totals?: {
    products: number;
    invoice: number;
    freight: number;
    insurance: number;
    discount: number;
    otherExpenses: number;
  };
  installments?: Array<{
    number: string;
    dueDate: string | null;
    value: number;
  }>;
  receivedAt: string;
  /** Informações complementares do XML — onde o fornecedor do Simples informa o crédito (LC 123). */
  infCpl?: string;
  items: FiscalDraftItem[];
};

type Installment = {
  id: string;
  label: string;
  dueDate: string;
  amount: number;
  paymentMethod: string;
};

type FormaPagamentoOption = { id: string; nome: string };

type FiscalEntryWizardProps = {
  products: ProductPickerOption[];
  formasPagamento?: FormaPagamentoOption[];
  cfopsEntrada?: { codigo: string; descricao: string }[];
  initialDraft?: FiscalDraft | null;
  /** Margens (%) padrão da empresa para sugerir preços à vista/a prazo dos novos SKUs. */
  margensPadrao?: { vista: number | null; prazo: number | null };
};

const today = new Date().toISOString().slice(0, 10);

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(value);
}

function formatQty(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(value);
}

// Resumo de um imposto do XML para conferência: "ICMS CSOSN 500 · IPI CST 53 · PIS CST 01 0,65% R$ 0,04".
// Distingue CST (regime normal) de CSOSN (Simples Nacional) para não confundir os códigos.
function formatImposto(imp: { tributo: string; cst: string | null; csosn: string | null; aliquota: number; valor: number; credSnAliquota?: number; credSnValor?: number }): string {
  const situacao = imp.cst ? `CST ${imp.cst}` : imp.csosn ? `CSOSN ${imp.csosn}` : "";
  const aliq = imp.aliquota > 0 ? `${imp.aliquota.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : "";
  const val = imp.valor > 0 ? formatBrl(imp.valor) : "";
  // Fornecedor do Simples: nota sem destaque, mas com crédito permitido (LC 123, art. 23).
  const credSn =
    (imp.credSnValor ?? 0) > 0
      ? `Créd. Simples ${formatBrl(imp.credSnValor ?? 0)}${(imp.credSnAliquota ?? 0) > 0 ? ` (${(imp.credSnAliquota ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)` : ""}`
      : "";
  return [imp.tributo, situacao, aliq, val, credSn].filter(Boolean).join(" ");
}

// Descrições resumidas dos códigos de ICMS, para o usuário que lança a nota entender o que veio.
const ICMS_CSOSN_DESC: Record<string, string> = {
  "101": "Simples, COM crédito de ICMS",
  "102": "Simples, SEM crédito de ICMS",
  "103": "Simples, isenção do ICMS",
  "201": "Simples, com crédito e com ICMS-ST",
  "202": "Simples, sem crédito e com ICMS-ST",
  "203": "Simples, isenção e com ICMS-ST",
  "300": "Imune",
  "400": "Não tributada no Simples",
  "500": "ICMS já recolhido por substituição tributária (ST)",
  "900": "Outros"
};
const ICMS_CST_DESC: Record<string, string> = {
  "00": "Tributada integralmente",
  "10": "Tributada e com cobrança de ICMS-ST",
  "20": "Com redução de base de cálculo",
  "30": "Isenta/não tributada e com cobrança de ICMS-ST",
  "40": "Isenta",
  "41": "Não tributada",
  "50": "Suspensão",
  "51": "Diferimento",
  "60": "ICMS já recolhido por substituição tributária (ST)",
  "70": "Com redução de base e cobrança de ICMS-ST",
  "90": "Outras"
};

function currencyToNumber(value: string) {
  return Number(value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
}

function decimalInputToNumber(value?: string) {
  if (!value) {
    return 0;
  }

  return Number(value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
}

/** Custo unitário do item na unidade de VENDA (valor do XML ÷ fator de conversão de embalagem). */
function custoUnitarioVenda(item: FiscalDraftItem) {
  const fator = item.fatorConversao && item.fatorConversao > 0 ? item.fatorConversao : 1;
  return currencyToNumber(item.importedProduct.costValue) / fator;
}

/** Preço formado por margem sobre o custo: custo × (1 + margem/100), arredondado a centavos. */
function precoPorMargem(custo: number, margemPct: number) {
  return Math.round((custo * (1 + margemPct / 100) + Number.EPSILON) * 100) / 100;
}

function numberToDecimalInput(value: number) {
  return value.toFixed(2).replace(".", ",");
}

type MargensPadrao = { vista: number | null; prazo: number | null };

/**
 * Sugestão de preços do novo SKU pelas margens padrão da empresa (custo × (1 + margem/100)).
 * Só preenche o que está vazio — nunca sobrescreve preço já digitado/salvo na conferência.
 */
function comPrecosSugeridos(item: FiscalDraftItem, margensPadrao?: MargensPadrao): Partial<FiscalDraftItem> {
  const custo = custoUnitarioVenda(item);
  const changes: Partial<FiscalDraftItem> = {};
  if (custo <= 0 || item.movimentaEstoque === false) {
    return changes;
  }
  if (margensPadrao?.vista && decimalInputToNumber(item.salePrice) <= 0) {
    changes.marginCash = numberToDecimalInput(margensPadrao.vista);
    changes.salePrice = numberToDecimalInput(precoPorMargem(custo, margensPadrao.vista));
  }
  if (margensPadrao?.prazo && decimalInputToNumber(item.salePriceTerm) <= 0) {
    changes.marginTerm = numberToDecimalInput(margensPadrao.prazo);
    changes.salePriceTerm = numberToDecimalInput(precoPorMargem(custo, margensPadrao.prazo));
  }
  return changes;
}

/** Preenche os preços sugeridos nos itens que JÁ chegam marcados para criar novo SKU. */
function aplicarMargensPadraoAoDraft(draft: FiscalDraft, margensPadrao?: MargensPadrao): FiscalDraft {
  if (!margensPadrao?.vista && !margensPadrao?.prazo) {
    return draft;
  }
  return {
    ...draft,
    items: draft.items.map((item) => (item.action === "create" ? { ...item, ...comPrecosSugeridos(item, margensPadrao) } : item))
  };
}

function installmentsFromDraft(draft: FiscalDraft): Installment[] {
  if (draft.installments?.length) {
    return draft.installments.map((installment, index) => ({
      id: `${installment.number}-${index}`,
      label: installment.number || String(index + 1),
      dueDate: installment.dueDate?.slice(0, 10) || today,
      amount: installment.value,
      paymentMethod: "Conforme XML"
    }));
  }

  return [{
    id: "manual-1",
    label: "1/1",
    dueDate: today,
    amount: draft.totals?.invoice ?? 0,
    paymentMethod: "Informar"
  }];
}

export function FiscalEntryWizard({ initialDraft = null, products, formasPagamento = [], cfopsEntrada = [], margensPadrao }: FiscalEntryWizardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<WizardStep>(1);
  const [draft, setDraft] = useState<FiscalDraft | null>(initialDraft ? aplicarMargensPadraoAoDraft(initialDraft, margensPadrao) : null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestingFinalidade, setSuggestingFinalidade] = useState(false);
  const [suggestingFiscal, setSuggestingFiscal] = useState(false);
  const [finalidadeEmMassa, setFinalidadeEmMassa] = useState<FinalidadeEntrada>("REVENDA");
  // Há alterações de vínculo/finalidade ainda não gravadas? Evita re-salvar os 50 itens toda vez
  // que o usuário volta e avança sem mudar nada. Começa true: a primeira passagem sempre grava.
  const [itemsDirty, setItemsDirty] = useState(true);
  const [installments, setInstallments] = useState<Installment[]>(initialDraft ? installmentsFromDraft(initialDraft) : []);

  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const totalInvoice = draft?.totals?.invoice ?? 0;
  const totalItems = draft?.items.reduce((total, item) => total + currencyToNumber(item.importedProduct.costValue) * item.importedProduct.availableStock, 0) ?? 0;
  const linkedCount = draft?.items.filter((item) => item.action === "update" && item.matchedProductId).length ?? 0;
  const createCount = draft?.items.filter((item) => item.action === "create").length ?? 0;

  // Legenda: códigos de ICMS (CST/CSOSN) que aparecem nos itens desta nota, com explicação resumida.
  const legendaIcms = useMemo(() => {
    const codigos = new Map<string, string>();
    for (const item of draft?.items ?? []) {
      for (const imp of item.impostos ?? []) {
        if (imp.tributo !== "ICMS") continue;
        if (imp.cst) codigos.set(`CST ${imp.cst}`, ICMS_CST_DESC[imp.cst] ?? "Situação tributária do ICMS");
        else if (imp.csosn) codigos.set(`CSOSN ${imp.csosn}`, ICMS_CSOSN_DESC[imp.csosn] ?? "Situação do ICMS no Simples Nacional");
      }
    }
    return [...codigos.entries()];
  }, [draft]);

  async function importXml(file: File) {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const xmlText = await file.text();
      const response = await fetch("/api/erp/entradas-fiscais/xml", {
        body: JSON.stringify({ xmlText }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const data = await response.json() as FiscalDraft & { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível importar o XML.");
      }

      setDraft(aplicarMargensPadraoAoDraft(data, margensPadrao));
      setInstallments(installmentsFromDraft(data));
      setMessage(`XML validado com sucesso. ${data.items.length} itens lidos.`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Não foi possível importar o XML.");
    } finally {
      setLoading(false);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) {
      await importXml(file);
    }

    event.target.value = "";
  }

  function updateItem(itemId: string, changes: Partial<FiscalDraftItem>) {
    setItemsDirty(true);
    setDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        items: current.items.map((item) => item.id === itemId ? { ...item, ...changes } : item)
      };
    });
  }

  // Margem (%) digitada no item: recalcula o preço correspondente a partir do custo convertido.
  function updateMargem(item: FiscalDraftItem, tipo: "vista" | "prazo", valor: string) {
    const margem = decimalInputToNumber(valor);
    const custo = custoUnitarioVenda(item);
    const preco = margem > 0 && custo > 0 ? numberToDecimalInput(precoPorMargem(custo, margem)) : undefined;
    updateItem(item.id, tipo === "vista"
      ? { marginCash: valor, ...(preco ? { salePrice: preco } : {}) }
      : { marginTerm: valor, ...(preco ? { salePriceTerm: preco } : {}) });
  }

  // Aplica uma finalidade a TODOS os itens de uma vez (notas homogêneas — ex.: tudo uso e consumo).
  // Espelha a edição por item: recalcula o CFOP de entrada e se movimenta estoque. Continua sendo
  // possível ajustar item a item depois, e nada é gravado até confirmar o lançamento.
  function applyFinalidadeToAll(finalidade: FinalidadeEntrada) {
    setItemsDirty(true);
    setDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        items: current.items.map((item) => ({
          ...item,
          finalidade,
          finalidadeOrigem: "MANUAL",
          cfopEntradaDerivado: recalcCfopEntrada(finalidade, item.cfopEntradaDerivado),
          movimentaEstoque: finalidade === "REVENDA" || finalidade === "INDUSTRIALIZACAO"
        }))
      };
    });
    const label = FINALIDADE_OPCOES.find((o) => o.value === finalidade)?.label ?? finalidade;
    setError("");
    setMessage(`Finalidade "${label}" aplicada a todos os itens. Revise antes de prosseguir.`);
  }

  // Ação em massa: todos os itens ainda SEM produto vinculado passam a "criar novo SKU" de uma vez
  // (nota de fornecedor novo costuma ser 100% de itens novos — evita marcar item a item). Os já
  // vinculados não são tocados; os preços de venda continuam sendo preenchidos por item.
  function marcarNaoVinculadosComoNovoSku() {
    let marcados = 0;
    setItemsDirty(true);
    setDraft((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        items: current.items.map((item) => {
          if (item.matchedProductId || item.movimentaEstoque === false || item.action === "create") {
            return item;
          }
          marcados++;
          return { ...item, action: "create" as const, matchedProductId: undefined, ...comPrecosSugeridos(item, margensPadrao) };
        })
      };
    });
    setError("");
    setMessage(marcados > 0
      ? `${marcados} item(ns) sem vínculo marcados para criar novo SKU. Preencha os preços de venda.`
      : "Todos os itens já estão vinculados ou marcados.");
  }

  async function persistLinks() {
    if (!draft) {
      return;
    }

    // Uso/consumo e imobilizado não viram SKU; insumo (industrialização) vira SKU mas NÃO é vendido
    // (é consumido na produção) — só itens VENDÁVEIS exigem preço de venda.
    const ehInsumo = (item: { finalidade?: FinalidadeEntrada | null }) =>
      item.finalidade === "INDUSTRIALIZACAO" || item.finalidade === "RETORNO_INDUSTRIALIZACAO" ||
      item.finalidade === "MATERIAL_SERVICO_ICMS" || item.finalidade === "MATERIAL_SERVICO_ISS";
    const missingPrice = draft.items.find(
      (item) => item.action === "create" && item.movimentaEstoque !== false && !ehInsumo(item) && decimalInputToNumber(item.salePrice) <= 0
    );

    if (missingPrice) {
      setError(`Informe o preço de venda à vista do novo item ${missingPrice.importedProduct.sku} (cód. do fornecedor).`);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/erp/entradas-fiscais/itens/vinculos", {
        body: JSON.stringify({
          links: draft.items.map((item) => ({
            itemId: item.id,
            produtoId: item.action === "update" ? item.matchedProductId : null,
            criarNovoSku: item.action === "create",
            precoVenda: item.action === "create" ? decimalInputToNumber(item.salePrice) : null,
            precoVendaPrazo: item.action === "create" ? (decimalInputToNumber(item.salePriceTerm) || null) : null,
            precoMinimo: item.action === "create" ? decimalInputToNumber(item.minimumPrice) : null,
            marca: item.action === "create" ? item.brand?.trim() || null : null,
            finalidade: item.finalidade ?? null,
            cfopEntrada: item.cfopEntradaDerivado ?? null,
            fatorConversao: item.fatorConversao && item.fatorConversao > 0 ? item.fatorConversao : 1,
            unidadeVenda: item.unidadeVenda?.trim() || null
          }))
        }),
        headers: { "Content-Type": "application/json" },
        method: "PUT"
      });
      const data = await response.json() as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível salvar o vínculo dos itens.");
      }

      setItemsDirty(false);
      setStep(3);
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "Não foi possível salvar o vínculo dos itens.");
    } finally {
      setLoading(false);
    }
  }

  async function suggestLinks() {
    if (!draft) {
      return;
    }

    setSuggesting(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/erp/entradas-fiscais/${draft.id}/ia/vinculos`, { method: "POST" });
      const data = await response.json() as {
        suggestions?: Array<{ itemId: string; produtoId: string | null; confianca: number; motivo: string }>;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível sugerir vínculos com IA.");
      }

      const suggestions = data.suggestions ?? [];
      setItemsDirty(true);
      setDraft((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          items: current.items.map((item) => {
            const suggestion = suggestions.find((entry) => entry.itemId === item.id);

            if (!suggestion || !suggestion.produtoId || !productsById.has(suggestion.produtoId)) {
              return item;
            }

            return {
              ...item,
              matchedProductId: suggestion.produtoId,
              action: "update",
              confidence: suggestion.confianca,
              review: suggestion.confianca < 85
            };
          })
        };
      });
      setMessage("Sugestões de vínculo aplicadas para conferência.");
    } catch (aiError) {
      setError(aiError instanceof Error ? aiError.message : "Não foi possível sugerir vínculos com IA.");
    } finally {
      setSuggesting(false);
    }
  }

  async function suggestFinalidades() {
    if (!draft) {
      return;
    }

    setSuggestingFinalidade(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/erp/entradas-fiscais/${draft.id}/ia/finalidades`, { method: "POST" });
      const data = await response.json() as {
        suggestions?: Array<{ itemId: string; finalidade: FinalidadeEntrada; confianca: number; motivo: string }>;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível sugerir finalidades com IA.");
      }

      const suggestions = data.suggestions ?? [];
      setItemsDirty(true);
      setDraft((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          items: current.items.map((item) => {
            const suggestion = suggestions.find((entry) => entry.itemId === item.id);

            if (!suggestion) {
              return item;
            }

            return {
              ...item,
              finalidade: suggestion.finalidade,
              finalidadeOrigem: "IA",
              cfopEntradaDerivado: recalcCfopEntrada(suggestion.finalidade, item.cfopEntradaDerivado),
              movimentaEstoque: suggestion.finalidade === "REVENDA" || suggestion.finalidade === "INDUSTRIALIZACAO"
            };
          })
        };
      });
      setMessage("Sugestões de finalidade aplicadas para conferência.");
    } catch (aiError) {
      setError(aiError instanceof Error ? aiError.message : "Não foi possível sugerir finalidades com IA.");
    } finally {
      setSuggestingFinalidade(false);
    }
  }

  // Sugere NCM (ancorado na tabela oficial) com IA para os itens sem NCM. Preenche para conferência.
  async function suggestFiscal() {
    if (!draft) {
      return;
    }
    setSuggestingFiscal(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/erp/entradas-fiscais/${draft.id}/ia/fiscal`, { method: "POST" });
      const data = await response.json() as {
        suggestions?: Array<{ itemId: string; ncmSugerido: string | null; confianca: number; motivo: string }>;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || "Não foi possível sugerir dados fiscais com IA.");
      }
      const suggestions = data.suggestions ?? [];
      const aplicaveis = suggestions.filter((s) => s.ncmSugerido);
      if (!aplicaveis.length) {
        setMessage("A IA não encontrou NCM com segurança para os itens pendentes.");
        return;
      }
      setItemsDirty(true);
      setDraft((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          items: current.items.map((item) => {
            const suggestion = aplicaveis.find((entry) => entry.itemId === item.id);
            // Só preenche NCM vazio — não sobrescreve o que já veio do XML.
            if (!suggestion || item.importedProduct.ncm.replace(/\D/g, "").length === 8) {
              return item;
            }
            return { ...item, importedProduct: { ...item.importedProduct, ncm: suggestion.ncmSugerido as string } };
          })
        };
      });
      setMessage(`NCM sugerido por IA para ${aplicaveis.length} item(ns). Confira com seu contador antes de confirmar.`);
    } catch (aiError) {
      setError(aiError instanceof Error ? aiError.message : "Não foi possível sugerir dados fiscais com IA.");
    } finally {
      setSuggestingFiscal(false);
    }
  }

  async function confirmEntry() {
    if (!draft) {
      return;
    }

    const installmentsTotal = installments.reduce((total, installment) => total + installment.amount, 0);

    if (!installments.length || installments.some((installment) => !installment.dueDate || installment.amount <= 0)) {
      setError("Informe vencimento e valor válido para todas as parcelas antes de confirmar o lançamento.");
      return;
    }

    if (Math.abs(installmentsTotal - totalInvoice) > 0.05) {
      setError(`O total das parcelas (${formatBrl(installmentsTotal)}) precisa fechar com o total da NF-e (${formatBrl(totalInvoice)}).`);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/erp/entradas-fiscais/${draft.id}/processar`, {
        body: JSON.stringify({
          installments: installments.map((installment) => ({
            number: installment.label,
            dueDate: installment.dueDate,
            value: installment.amount,
            paymentMethod: installment.paymentMethod
          }))
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const data = await response.json() as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível confirmar o lançamento.");
      }

      setMessage("Entrada fiscal lançada com sucesso.");
      setStep(4);
      // Leva a confirmação para a lista (o redirect é imediato, então a mensagem aqui não seria vista).
      window.location.href = `/erp/entradas-fiscais?lancada=${encodeURIComponent(draft.invoice || "1")}`;
    } catch (entryError) {
      setError(entryError instanceof Error ? entryError.message : "Não foi possível confirmar o lançamento.");
    } finally {
      setLoading(false);
    }
  }

  const busyMessage = step === 1
    ? "Importando e lendo o XML da NF-e…"
    : step === 2
      ? "Salvando vínculos e classificação dos itens…"
      : step === 4
        ? "Lançando a nota e atualizando o estoque…"
        : "Processando…";

  return (
    <section className="fiscal-wizard" aria-busy={loading}>
      {loading && (
        <div className="fiscal-busy" role="alertdialog" aria-live="assertive" aria-label="Processando">
          <div className="fiscal-busy-card">
            <div className="fiscal-spinner" aria-hidden="true" />
            <strong>{busyMessage}</strong>
            <small>Pode levar alguns segundos em notas com muitos itens. Não feche esta janela.</small>
          </div>
        </div>
      )}
      <header className="fiscal-wizard-head">
        <div>
          <span className="section-kicker">Nova entrada - NF-e</span>
          <h2>Lançamento de Nota Fiscal de Entrada</h2>
        </div>
        <Button href="/erp/entradas-fiscais" variant="light">Fechar</Button>
      </header>

      <nav className="fiscal-steps">
        <StepButton index={1} current={step} done={Boolean(draft)} label="Cabeçalho da NF" onClick={() => setStep(1)} />
        <StepButton index={2} current={step} done={step > 2} label="Itens & vínculo ao estoque" onClick={() => draft && setStep(2)} />
        <StepButton index={3} current={step} done={step > 3} label="Financeiro - Parcelas" onClick={() => draft && setStep(3)} />
        <StepButton index={4} current={step} done={false} label="Conferência & lançamento" onClick={() => draft && setStep(4)} />
      </nav>

      {message && <div className="alert info fiscal-wizard-alert"><strong>OK</strong><span>{message}</span></div>}
      {error && <div className="alert danger fiscal-wizard-alert"><strong>Atenção</strong><span>{error}</span></div>}

      {step === 1 && (
        <div className="fiscal-step-body">
          <div className="fiscal-upload-row">
            <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={loading}>
              {loading ? "Importando..." : "Importar XML da NF-e"}
            </Button>
            <Button href="/erp/entradas-fiscais/manual" variant="light">
              Lançamento manual (sem XML)
            </Button>
            <input ref={fileInputRef} className="sr-only-file" type="file" accept=".xml,text/xml,application/xml" onChange={handleFileChange} />
          </div>

          <h3>Dados da NF-e</h3>
          <div className="erp-form fiscal-form-grid">
            <label>Número da NF<input readOnly value={draft?.invoice ?? ""} /></label>
            <label>Série<input readOnly value={draft?.series ?? ""} /></label>
            <label>Data de emissão<input readOnly type="date" value={draft?.issuedAt?.slice(0, 10) ?? today} /></label>
            <label className="full">Chave de acesso<input readOnly value={draft?.accessKey ?? ""} /></label>
            <label>Natureza da operação<input readOnly value={draft?.mainCfop ? `CFOP ${draft.mainCfop}` : ""} /></label>
            <label>Tipo<select value="0" disabled><option value="0">0 - Entrada</option></select></label>
          </div>

          <h3>Fornecedor (emitente)</h3>
          <div className="erp-form fiscal-form-grid">
            <label className="span-2">Razão Social<input readOnly value={draft?.supplier ?? ""} /></label>
            <label>CNPJ<input readOnly value={draft?.supplierDocument ?? ""} /></label>
          </div>
        </div>
      )}

      {step === 2 && draft && (
        <div className="fiscal-step-body">
          <div className="fiscal-step-title">
            <div>
              <h3>Itens da NF</h3>
              <p>Para cada item, vincule a um produto cadastrado ou deixe marcado para criar um novo SKU no lançamento.</p>
            </div>
            <div className="fiscal-step-actions">
              <div className="fiscal-bulk-finalidade" title="Define a mesma finalidade para todos os itens da nota">
                <span>Finalidade de todos:</span>
                <select
                  aria-label="Finalidade para todos os itens"
                  value={finalidadeEmMassa}
                  onChange={(event) => setFinalidadeEmMassa(event.target.value as FinalidadeEntrada)}
                >
                  {FINALIDADE_OPCOES.map((opcao) => (
                    <option key={opcao.value} value={opcao.value}>{opcao.label}</option>
                  ))}
                </select>
                <Button type="button" variant="light" onClick={() => applyFinalidadeToAll(finalidadeEmMassa)}>
                  Aplicar a todos
                </Button>
              </div>
              <Button type="button" variant="light" onClick={suggestFinalidades} disabled={suggestingFinalidade}>
                {suggestingFinalidade ? "Consultando IA..." : "Sugerir finalidades com IA"}
              </Button>
              <Button type="button" variant="light" onClick={suggestLinks} disabled={suggesting}>
                {suggesting ? "Consultando IA..." : "Sugerir vínculos com IA"}
              </Button>
              <Button
                type="button"
                variant="light"
                title="Marca 'novo SKU' em todos os itens que ainda não têm produto vinculado (fornecedor novo: tudo de uma vez)"
                onClick={marcarNaoVinculadosComoNovoSku}
              >
                Não vinculados → novo SKU
              </Button>
              <Button type="button" variant="light" onClick={suggestFiscal} disabled={suggestingFiscal}>
                {suggestingFiscal ? "Consultando IA..." : "Sugerir NCM com IA"}
              </Button>
            </div>
          </div>

          <div className="erp-table-wrap fiscal-entry-table">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Cód. fornecedor</th>
                  <th>Descrição</th>
                  <th className="num">Qtd.</th>
                  <th className="num">Custo</th>
                  <th className="num">Total</th>
                  <th>Conversão (compra → venda)</th>
                  <th>Finalidade</th>
                  <th>Vínculo no estoque</th>
                </tr>
              </thead>
              <tbody>
                {draft.items.map((item) => (
                  <tr key={item.id}>
                    <td className="mono bold">{item.importedProduct.sku}</td>
                    <td>
                      <strong>{item.importedProduct.name}</strong>
                      <small className="block-muted">NCM {item.importedProduct.ncm || "não informado"} · CFOP {item.importedProduct.cfopInState || "não informado"} · {item.importedProduct.unit}</small>
                      {item.impostos && item.impostos.length > 0 && (
                        <small className="block-muted fiscal-item-impostos">
                          {item.impostos.map((imp) => formatImposto(imp)).filter(Boolean).join("  ·  ")}
                        </small>
                      )}
                    </td>
                    <td className="num">{item.importedProduct.availableStock}</td>
                    <td className="num">{item.importedProduct.costValue}</td>
                    <td className="num">{formatBrl(currencyToNumber(item.importedProduct.costValue) * item.importedProduct.availableStock)}</td>
                    <td>
                      {item.movimentaEstoque === false ? (
                        <small className="block-muted">—</small>
                      ) : (() => {
                        const fator = item.fatorConversao && item.fatorConversao > 0 ? item.fatorConversao : 1;
                        const qtdVenda = item.importedProduct.availableStock * fator;
                        const custoUn = fator > 0 ? currencyToNumber(item.importedProduct.costValue) / fator : 0;
                        const unVenda = item.unidadeVenda?.trim() || (fator > 1 ? "UN" : item.importedProduct.unit);
                        return (
                          <div className="fiscal-conversao-box">
                            <div className="fiscal-conversao-inputs">
                              <label>
                                <span>1 {item.importedProduct.unit} =</span>
                                <input
                                  inputMode="decimal"
                                  style={{ width: 64 }}
                                  value={String(fator).replace(".", ",")}
                                  onChange={(event) => {
                                    const v = decimalInputToNumber(event.target.value);
                                    updateItem(item.id, { fatorConversao: v > 0 ? v : 1 });
                                  }}
                                />
                              </label>
                              <input
                                aria-label="Unidade de venda"
                                style={{ width: 60 }}
                                placeholder="UN"
                                value={unVenda}
                                onChange={(event) => updateItem(item.id, { unidadeVenda: event.target.value.toUpperCase().slice(0, 6) })}
                              />
                            </div>
                            <small className="block-muted">
                              {fator > 1
                                ? `entra ${formatQty(qtdVenda)} ${unVenda} a ${formatBrl(custoUn)}/${unVenda}`
                                : `sem conversão (1 ${item.importedProduct.unit} = 1 ${unVenda})`}
                            </small>
                          </div>
                        );
                      })()}
                    </td>
                    <td>
                      <select
                        value={item.finalidade ?? "REVENDA"}
                        onChange={(event) => {
                          const finalidade = event.target.value as FinalidadeEntrada;
                          updateItem(item.id, {
                            finalidade,
                            finalidadeOrigem: "MANUAL",
                            cfopEntradaDerivado: recalcCfopEntrada(finalidade, item.cfopEntradaDerivado),
                            movimentaEstoque: finalidade === "REVENDA" || finalidade === "INDUSTRIALIZACAO"
                          });
                        }}
                      >
                        {FINALIDADE_OPCOES.map((opcao) => (
                          <option key={opcao.value} value={opcao.value}>{opcao.label}</option>
                        ))}
                      </select>
                      <label className="cfop-entrada-field">
                        <span>CFOP entrada</span>
                        <input
                          list="cfop-entrada-especiais"
                          value={item.cfopEntradaDerivado ?? ""}
                          maxLength={4}
                          inputMode="numeric"
                          placeholder="0000"
                          onChange={(event) => updateItem(item.id, { cfopEntradaDerivado: event.target.value.replace(/\D/g, "").slice(0, 4) })}
                        />
                      </label>
                      <small className="block-muted">
                        {item.finalidadeOrigem ? `${FINALIDADE_ORIGEM_LABEL[item.finalidadeOrigem] ?? item.finalidadeOrigem}` : ""}
                        {item.movimentaEstoque === false ? " · não movimenta estoque" : ""}
                      </small>
                    </td>
                    <td>
                      <div className="fiscal-link-actions">
                        <button className={item.action === "update" ? "active" : ""} type="button" onClick={() => updateItem(item.id, { action: "update" })}>
                          Vincular existente
                        </button>
                        <button className={item.action === "create" ? "active" : ""} type="button" onClick={() => updateItem(item.id, { action: "create", matchedProductId: undefined, ...comPrecosSugeridos(item, margensPadrao) })}>
                          Criar novo SKU
                        </button>
                      </div>
                      {item.action === "update" ? (
                        <select
                          value={item.matchedProductId ?? ""}
                          onChange={(event) => updateItem(item.id, { matchedProductId: event.target.value, review: false })}
                        >
                          <option value="">Selecione um produto</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>
                          ))}
                        </select>
                      ) : item.movimentaEstoque === false ? (
                        <div className="new-sku-box">
                          {item.finalidade === "IMOBILIZADO" ? "Bem do ativo imobilizado" : "Material de uso e consumo"}: lançado
                          como despesa/ativo, <strong>sem criar SKU nem movimentar estoque</strong>. A obrigação financeira é gerada normalmente.
                        </div>
                      ) : (
                        <div className="new-sku-box">
                          Novo SKU (código interno gerado no lançamento) · Cód. fornecedor <strong>{item.importedProduct.sku}</strong>
                          <label>
                            Marca
                            <input
                              placeholder="Opcional"
                              value={item.brand ?? ""}
                              onChange={(event) => updateItem(item.id, { brand: event.target.value })}
                            />
                          </label>
                          <label>
                            Margem à vista %
                            <input
                              inputMode="decimal"
                              placeholder="Ex.: 50"
                              value={item.marginCash ?? ""}
                              onChange={(event) => updateMargem(item, "vista", event.target.value)}
                            />
                          </label>
                          <label>
                            Preço à vista
                            <input
                              inputMode="decimal"
                              placeholder="0,00"
                              value={item.salePrice ?? ""}
                              onChange={(event) => updateItem(item.id, { salePrice: event.target.value })}
                            />
                          </label>
                          <label>
                            Margem a prazo %
                            <input
                              inputMode="decimal"
                              placeholder="Ex.: 65"
                              value={item.marginTerm ?? ""}
                              onChange={(event) => updateMargem(item, "prazo", event.target.value)}
                            />
                          </label>
                          <label>
                            Preço a prazo
                            <input
                              inputMode="decimal"
                              placeholder="Opcional (vale o à vista)"
                              value={item.salePriceTerm ?? ""}
                              onChange={(event) => updateItem(item.id, { salePriceTerm: event.target.value })}
                            />
                          </label>
                          <label>
                            Preço mínimo
                            <input
                              inputMode="decimal"
                              placeholder="Opcional"
                              value={item.minimumPrice ?? ""}
                              onChange={(event) => updateItem(item.id, { minimumPrice: event.target.value })}
                            />
                          </label>
                          <small className="block-muted">
                            Digite a margem (%) para calcular o preço a partir do custo{custoUnitarioVenda(item) > 0 ? ` (${formatBrl(custoUnitarioVenda(item))})` : ""}, ou informe o preço direto.
                          </small>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="erp-table-foot">
              <span>{linkedCount} vinculados · {createCount} novos SKUs serão criados</span>
              <strong>Valor dos itens: {formatBrl(totalItems)}</strong>
            </div>
          </div>
          <datalist id="cfop-entrada-especiais">
            {/* Tabela completa (CodigoFiscal) + curados — os curados cobrem códigos ausentes do
                dataset público (ex.: 2128). Dedup por código, ordenado. */}
            {(() => {
              const map = new Map<string, string>();
              for (const c of cfopsEntrada) map.set(c.codigo, c.descricao);
              for (const c of CFOP_ENTRADA_ESPECIAIS) if (!map.has(c.code)) map.set(c.code, c.label);
              return Array.from(map, ([code, label]) => ({ code, label })).sort((a, b) => a.code.localeCompare(b.code));
            })().map((cfop) => (
              <option key={cfop.code} value={cfop.code}>{cfop.code} · {cfop.label}</option>
            ))}
          </datalist>
          <p className="block-muted" style={{ marginTop: "0.5rem" }}>
            O CFOP de entrada é sugerido pela finalidade. Para casos especiais (devolução, remessa, importação,
            prestação de serviço etc.), digite o CFOP no campo ou escolha um da lista — todos os CFOPs de
            entrada (1xxx/2xxx/3xxx) estão disponíveis.
          </p>

          {(() => {
            // Crédito de ICMS de fornecedor do Simples (LC 123, art. 23): destacado na conferência
            // para o usuário saber que a nota SEM destaque ainda gera crédito aproveitável.
            const credSnTotal = (draft?.items ?? []).reduce(
              (total, item) => total + (item.impostos ?? []).reduce((s, imp) => s + (imp.credSnValor ?? 0), 0),
              0
            );
            if (credSnTotal <= 0 && !draft?.infCpl) return null;
            return (
              <div className="fiscal-legenda">
                {credSnTotal > 0 && (
                  <strong>
                    ✓ Crédito de ICMS do Simples Nacional nesta nota: {formatBrl(credSnTotal)} (LC 123, art. 23) —
                    será aproveitado na apuração e no SPED Fiscal.
                  </strong>
                )}
                {draft?.infCpl && (
                  <span className="fiscal-legenda-nota" style={{ display: "block", marginTop: 6 }}>
                    <b>Informações complementares do XML:</b> {draft.infCpl}
                  </span>
                )}
              </div>
            );
          })()}

          {legendaIcms.length > 0 && (
            <div className="fiscal-legenda">
              <strong>Entenda os códigos de ICMS desta nota</strong>
              <ul>
                {legendaIcms.map(([codigo, desc]) => (
                  <li key={codigo}><b>{codigo}</b> — {desc}</li>
                ))}
              </ul>
              <span className="fiscal-legenda-nota">
                <b>CST</b> é usado por empresas do regime normal (Lucro Presumido/Real); <b>CSOSN</b>, por empresas do
                Simples Nacional. Itens com <b>ST</b> (CSOSN 500 / CST 60) já tiveram o ICMS recolhido: não geram
                crédito na entrada e, na revenda, saem sem novo ICMS.
              </span>
            </div>
          )}
        </div>
      )}

      {step === 3 && draft && (
        <div className="fiscal-step-body">
          <div className="alert info fiscal-wizard-alert">
            <strong>Financeiro</strong>
            <span>
              {draft.installments?.length
                ? "Parcelas lidas do XML da NF-e para conferência antes do lançamento financeiro."
                : "O XML não trouxe duplicatas; informe manualmente as parcelas antes do lançamento financeiro."}
            </span>
          </div>
          <h3>Totais</h3>
          <div className="erp-form fiscal-form-grid">
            <label>Valor produtos<input readOnly value={formatBrl(draft.totals?.products ?? 0)} /></label>
            <label>Frete<input readOnly value={formatBrl(draft.totals?.freight ?? 0)} /></label>
            <label>Desconto<input readOnly value={formatBrl(draft.totals?.discount ?? 0)} /></label>
          </div>
          <h3>Parcelas / duplicatas</h3>
          <table className="erp-table fiscal-installments">
            <thead><tr><th>Nº</th><th>Vencimento</th><th className="num">Valor</th><th>Forma de pagamento</th></tr></thead>
            <tbody>
              {installments.map((installment) => (
                <tr key={installment.id}>
                  <td>{installment.label}</td>
                  <td><input type="date" value={installment.dueDate} onChange={(event) => setInstallments((current) => current.map((row) => row.id === installment.id ? { ...row, dueDate: event.target.value } : row))} /></td>
                  <td className="num"><input value={installment.amount.toFixed(2)} onChange={(event) => setInstallments((current) => current.map((row) => row.id === installment.id ? { ...row, amount: Number(event.target.value.replace(",", ".")) || 0 } : row))} /></td>
                  <td>
                    <select value={installment.paymentMethod} onChange={(event) => setInstallments((current) => current.map((row) => row.id === installment.id ? { ...row, paymentMethod: event.target.value } : row))}>
                      <option value="Conforme XML">Conforme XML</option>
                      {formasPagamento.map((forma) => (
                        <option key={forma.id} value={forma.nome}>{forma.nome}</option>
                      ))}
                      {/* Compatibilidade: mantém o valor atual mesmo que a forma não esteja cadastrada. */}
                      {installment.paymentMethod && installment.paymentMethod !== "Conforme XML" && !formasPagamento.some((f) => f.nome === installment.paymentMethod) && (
                        <option value={installment.paymentMethod}>{installment.paymentMethod}</option>
                      )}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {step === 4 && draft && (
        <div className="fiscal-step-body">
          <div className="fiscal-summary-grid">
            <SummaryBox title="NF-e" rows={[
              ["Número / Série", `${draft.invoice ?? ""} / ${draft.series ?? ""}`],
              ["Emissão", draft.issuedAt ? new Date(draft.issuedAt).toLocaleDateString("pt-BR") : ""],
              ["Chave de acesso", draft.accessKey ?? ""]
            ]} />
            <SummaryBox title="Fornecedor" rows={[
              ["Razão Social", draft.supplier ?? ""],
              ["CNPJ", draft.supplierDocument ?? ""]
            ]} />
          </div>
          <h3>Impacto no estoque</h3>
          <table className="erp-table">
            <thead><tr><th>SKU</th><th>Operação</th><th className="num">Qtd.</th><th className="num">Custo</th></tr></thead>
            <tbody>
              {draft.items.map((item) => {
                const fator = item.fatorConversao && item.fatorConversao > 0 ? item.fatorConversao : 1;
                const movimenta = item.movimentaEstoque !== false;
                const unVenda = item.unidadeVenda?.trim() || (fator > 1 ? "UN" : item.importedProduct.unit);
                const qtdVenda = item.importedProduct.availableStock * fator;
                const custoUn = currencyToNumber(item.importedProduct.costValue) / fator;
                return (
                <tr key={item.id}>
                  <td className="mono bold">{item.action === "create" ? item.importedProduct.sku : productsById.get(item.matchedProductId || "")?.sku ?? item.importedProduct.sku}</td>
                  <td><span className={item.action === "create" ? "status-badge warn" : "status-badge success"}>{item.action === "create" ? "Novo SKU + Entrada" : "Entrada"}</span></td>
                  <td className="num">
                    {movimenta ? `+${formatQty(qtdVenda)} ${unVenda}` : "—"}
                    {movimenta && fator > 1 && <small className="block-muted"> ({formatQty(item.importedProduct.availableStock)} {item.importedProduct.unit} × {formatQty(fator)})</small>}
                  </td>
                  <td className="num">{movimenta && fator > 1 ? `${formatBrl(custoUn)}/${unVenda}` : item.importedProduct.costValue}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
          <div className="fiscal-ready-box">Tudo pronto para lançar. Total da NF-e: <strong>{formatBrl(totalInvoice)}</strong></div>
        </div>
      )}

      <footer className="fiscal-wizard-foot">
        <strong>Total da NF: {formatBrl(totalInvoice)}</strong>
        <div>
          <Button href="/erp/entradas-fiscais" variant="light">Cancelar</Button>
          {step > 1 && <Button type="button" variant="light" onClick={() => setStep((current) => Math.max(1, current - 1) as WizardStep)}>Voltar</Button>}
          {step === 1 && <Button type="button" disabled={!draft} onClick={() => setStep(2)}>Avançar</Button>}
          {step === 2 && <Button type="button" onClick={() => itemsDirty ? persistLinks() : setStep(3)} disabled={loading}>{loading ? "Salvando vínculos..." : itemsDirty ? "Salvar e avançar" : "Avançar"}</Button>}
          {step === 3 && <Button type="button" onClick={() => setStep(4)}>Avançar</Button>}
          {step === 4 && <Button type="button" onClick={confirmEntry} disabled={loading}>{loading ? "Confirmando..." : "Confirmar lançamento"}</Button>}
        </div>
      </footer>
    </section>
  );
}

function StepButton({ current, done, index, label, onClick }: { current: WizardStep; done: boolean; index: WizardStep; label: string; onClick: () => void }) {
  return (
    <button className={[current === index ? "active" : "", done ? "done" : ""].filter(Boolean).join(" ")} type="button" onClick={onClick}>
      <span>{done ? "✓" : index}</span>
      {label}
    </button>
  );
}

function SummaryBox({ rows, title }: { title: string; rows: Array<[string, string]> }) {
  return (
    <section className="erp-card fiscal-summary-box">
      <h3>{title}</h3>
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  );
}

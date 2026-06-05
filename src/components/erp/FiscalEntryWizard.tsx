"use client";

import { useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Button } from "@/components/shared/Button";
import type { ErpProductSummary } from "@/lib/services/products";

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
  salePrice?: string;
  minimumPrice?: string;
  brand?: string;
  finalidade?: FinalidadeEntrada;
  finalidadeOrigem?: string;
  cfopEntradaDerivado?: string;
  movimentaEstoque?: boolean;
};

type FinalidadeEntrada = "REVENDA" | "USO_CONSUMO" | "IMOBILIZADO" | "INDUSTRIALIZACAO";

const FINALIDADE_OPCOES: Array<{ value: FinalidadeEntrada; label: string }> = [
  { value: "REVENDA", label: "Revenda" },
  { value: "USO_CONSUMO", label: "Uso e consumo" },
  { value: "IMOBILIZADO", label: "Imobilizado" },
  { value: "INDUSTRIALIZACAO", label: "Industrialização" }
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
  IMOBILIZADO: { semSt: ["1551", "2551"], comSt: ["1406", "2406"] }
};

function recalcCfopEntrada(finalidade: FinalidadeEntrada, cfopAtual: string | undefined): string {
  const interestadual = (cfopAtual ?? "").startsWith("2");
  const comSt = ["1403", "2403", "1401", "2401", "1407", "2407", "1406", "2406"].includes(cfopAtual ?? "");
  const par = comSt ? CFOP_ENTRADA_CLIENT[finalidade].comSt : CFOP_ENTRADA_CLIENT[finalidade].semSt;
  return par[interestadual ? 1 : 0];
}

// CFOPs de entrada especiais (fora da matriz das 4 finalidades), oferecidos como atalho no campo
// editável. 1xxx = mesmo estado, 2xxx = outro estado, 3xxx = exterior (importação).
const CFOP_ENTRADA_ESPECIAIS: Array<{ code: string; label: string }> = [
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
  items: FiscalDraftItem[];
};

type Installment = {
  id: string;
  label: string;
  dueDate: string;
  amount: number;
  paymentMethod: string;
};

type FiscalEntryWizardProps = {
  products: ErpProductSummary[];
  initialDraft?: FiscalDraft | null;
};

const today = new Date().toISOString().slice(0, 10);

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(value);
}

function currencyToNumber(value: string) {
  return Number(value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
}

function decimalInputToNumber(value?: string) {
  if (!value) {
    return 0;
  }

  return Number(value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
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

export function FiscalEntryWizard({ initialDraft = null, products }: FiscalEntryWizardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<WizardStep>(1);
  const [draft, setDraft] = useState<FiscalDraft | null>(initialDraft);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestingFinalidade, setSuggestingFinalidade] = useState(false);
  const [installments, setInstallments] = useState<Installment[]>(initialDraft ? installmentsFromDraft(initialDraft) : []);

  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const totalInvoice = draft?.totals?.invoice ?? 0;
  const totalItems = draft?.items.reduce((total, item) => total + currencyToNumber(item.importedProduct.costValue) * item.importedProduct.availableStock, 0) ?? 0;
  const linkedCount = draft?.items.filter((item) => item.action === "update" && item.matchedProductId).length ?? 0;
  const createCount = draft?.items.filter((item) => item.action === "create").length ?? 0;

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

      setDraft(data);
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

  async function persistLinks() {
    if (!draft) {
      return;
    }

    // Uso/consumo e imobilizado não viram SKU; só itens que movimentam estoque exigem preço.
    const missingPrice = draft.items.find(
      (item) => item.action === "create" && item.movimentaEstoque !== false && decimalInputToNumber(item.salePrice) <= 0
    );

    if (missingPrice) {
      setError(`Informe o preço de venda do novo SKU ${missingPrice.importedProduct.sku}.`);
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
            precoMinimo: item.action === "create" ? decimalInputToNumber(item.minimumPrice) : null,
            marca: item.action === "create" ? item.brand?.trim() || null : null,
            finalidade: item.finalidade ?? null,
            cfopEntrada: item.cfopEntradaDerivado ?? null
          }))
        }),
        headers: { "Content-Type": "application/json" },
        method: "PUT"
      });
      const data = await response.json() as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível salvar o vínculo dos itens.");
      }

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
      window.location.href = "/erp/entradas-fiscais";
    } catch (entryError) {
      setError(entryError instanceof Error ? entryError.message : "Não foi possível confirmar o lançamento.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="fiscal-wizard">
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
            <Button type="button" variant="light" onClick={() => setMessage("Preencha os dados manualmente e adicione itens na próxima etapa.")}>
              Lançamento manual
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
              <Button type="button" variant="light" onClick={suggestFinalidades} disabled={suggestingFinalidade}>
                {suggestingFinalidade ? "Consultando IA..." : "Sugerir finalidades com IA"}
              </Button>
              <Button type="button" variant="light" onClick={suggestLinks} disabled={suggesting}>
                {suggesting ? "Consultando IA..." : "Sugerir vínculos com IA"}
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
                    </td>
                    <td className="num">{item.importedProduct.availableStock}</td>
                    <td className="num">{item.importedProduct.costValue}</td>
                    <td className="num">{formatBrl(currencyToNumber(item.importedProduct.costValue) * item.importedProduct.availableStock)}</td>
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
                        <button className={item.action === "create" ? "active" : ""} type="button" onClick={() => updateItem(item.id, { action: "create", matchedProductId: undefined })}>
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
                          Novo SKU será criado: <strong>{item.importedProduct.sku}</strong>
                          <label>
                            Marca
                            <input
                              placeholder="Opcional"
                              value={item.brand ?? ""}
                              onChange={(event) => updateItem(item.id, { brand: event.target.value })}
                            />
                          </label>
                          <label>
                            Preço de venda
                            <input
                              inputMode="decimal"
                              placeholder="0,00"
                              value={item.salePrice ?? ""}
                              onChange={(event) => updateItem(item.id, { salePrice: event.target.value })}
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
            {CFOP_ENTRADA_ESPECIAIS.map((cfop) => (
              <option key={cfop.code} value={cfop.code}>{cfop.code} · {cfop.label}</option>
            ))}
          </datalist>
          <p className="block-muted" style={{ marginTop: "0.5rem" }}>
            O CFOP de entrada é sugerido pela finalidade. Para casos especiais (devolução, remessa, importação),
            digite o CFOP correto no campo ou escolha um da lista.
          </p>
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
                  <td><select value={installment.paymentMethod} onChange={(event) => setInstallments((current) => current.map((row) => row.id === installment.id ? { ...row, paymentMethod: event.target.value } : row))}><option>Conforme XML</option><option>Boleto bancário</option><option>Pix</option><option>Cartão</option><option>Faturado</option><option>Informar</option></select></td>
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
              {draft.items.map((item) => (
                <tr key={item.id}>
                  <td className="mono bold">{item.action === "create" ? item.importedProduct.sku : productsById.get(item.matchedProductId || "")?.sku ?? item.importedProduct.sku}</td>
                  <td><span className={item.action === "create" ? "status-badge warn" : "status-badge success"}>{item.action === "create" ? "Novo SKU + Entrada" : "Entrada"}</span></td>
                  <td className="num">+{item.importedProduct.availableStock}</td>
                  <td className="num">{item.importedProduct.costValue}</td>
                </tr>
              ))}
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
          {step === 2 && <Button type="button" onClick={persistLinks} disabled={loading}>{loading ? "Salvando vínculos..." : "Avançar"}</Button>}
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

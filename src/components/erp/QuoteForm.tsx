"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { KpiCard } from "@/components/shared/KpiCard";
import type { QuoteFormData } from "@/lib/services/sales-quote";

type LineItem = {
  produtoId: string;
  quantidade: number;
  precoUnitario: number;
};

type Props = {
  formData: QuoteFormData;
};

export function QuoteForm({ formData }: Props) {
  const router = useRouter();
  const [clienteId, setClienteId] = useState("");
  const [vendedorId, setVendedorId] = useState("");
  const [condicaoPagamento, setCondicaoPagamento] = useState("");
  const [validadeDias, setValidadeDias] = useState(30);
  const [desconto, setDesconto] = useState(0);
  const [observacaoVendedor, setObservacaoVendedor] = useState("");
  const [itens, setItens] = useState<LineItem[]>([
    { produtoId: "", quantidade: 1, precoUnitario: 0 },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function addItem() {
    setItens((cur) => [...cur, { produtoId: "", quantidade: 1, precoUnitario: 0 }]);
  }

  function removeItem(index: number) {
    setItens((cur) => cur.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof LineItem, value: string | number) {
    setItens((cur) =>
      cur.map((item, i) => {
        if (i !== index) return item;
        if (field === "produtoId") {
          const produto = formData.produtos.find((p) => p.id === value);
          return {
            ...item,
            produtoId: value as string,
            precoUnitario: produto ? produto.preco : item.precoUnitario,
          };
        }
        return { ...item, [field]: value };
      })
    );
  }

  const subtotal = itens.reduce((sum, i) => sum + i.quantidade * i.precoUnitario, 0);
  const total = Math.max(0, subtotal - desconto);

  function formatBrl(v: number) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!clienteId) {
      setError("Selecione um cliente.");
      return;
    }
    if (itens.some((i) => !i.produtoId)) {
      setError("Todos os itens devem ter um produto selecionado.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/erp/orcamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteId,
          vendedorId: vendedorId || undefined,
          condicaoPagamento: condicaoPagamento || undefined,
          validadeDias,
          desconto,
          observacaoVendedor: observacaoVendedor || undefined,
          itens,
        }),
      });
      const data = (await res.json()) as { id?: string; numero?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar orçamento.");
      router.push("/erp/orcamentos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar orçamento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="alert danger">
          <strong>Erro</strong>
          <span>{error}</span>
        </div>
      )}

      <div className="erp-card">
        <div className="erp-card-head"><h3>Dados do orçamento</h3></div>
        <div className="erp-form">
          <label htmlFor="clienteId">
            <span>Cliente <span aria-hidden="true">*</span></span>
            <select
              id="clienteId"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              required
            >
              <option value="">Selecione um cliente</option>
              {formData.clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label htmlFor="vendedor">
            <span>Vendedor</span>
            <select id="vendedor" value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
              <option value="">Sem vendedor</option>
              {formData.vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </select>
          </label>

          <label htmlFor="condicaoPagamento">
            <span>Condição de pagamento</span>
            <input
              id="condicaoPagamento"
              type="text"
              placeholder="Ex: 30/60/90"
              value={condicaoPagamento}
              onChange={(e) => setCondicaoPagamento(e.target.value)}
            />
          </label>

          <label htmlFor="validadeDias">
            <span>Validade (dias)</span>
            <input
              id="validadeDias"
              type="number"
              min={1}
              max={365}
              value={validadeDias}
              onChange={(e) => setValidadeDias(Number(e.target.value))}
            />
          </label>
        </div>
      </div>

      <div className="erp-card">
        <div className="erp-card-head"><h3>Itens</h3></div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th className="num">Qtd.</th>
                <th className="num">Preço unit.</th>
                <th className="num">Total</th>
                <th className="actions" />
              </tr>
            </thead>
            <tbody>
              {itens.map((item, index) => (
                <tr key={index}>
                  <td>
                    <select
                      value={item.produtoId}
                      onChange={(e) => updateItem(index, "produtoId", e.target.value)}
                      required
                    >
                      <option value="">Selecione</option>
                      {formData.produtos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {p.nome}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num">
                    <input
                      type="number"
                      min={1}
                      value={item.quantidade}
                      onChange={(e) => updateItem(index, "quantidade", Number(e.target.value))}
                      style={{ width: "80px" }}
                    />
                  </td>
                  <td className="num">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.precoUnitario}
                      onChange={(e) => updateItem(index, "precoUnitario", Number(e.target.value))}
                      style={{ width: "120px" }}
                    />
                  </td>
                  <td className="num">{formatBrl(item.quantidade * item.precoUnitario)}</td>
                  <td className="actions">
                    {itens.length > 1 && (
                      <button
                        className="danger-link"
                        type="button"
                        onClick={() => removeItem(index)}
                      >
                        Remover
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 8 }}>
          <Button type="button" variant="light" onClick={addItem}>
            + Adicionar item
          </Button>
        </div>
      </div>

      <div className="erp-card">
        <div className="erp-card-head"><h3>Totais</h3></div>
        <div className="erp-form">
          <label htmlFor="desconto">
            <span>Desconto (R$)</span>
            <input
              id="desconto"
              type="number"
              min={0}
              step={0.01}
              max={subtotal}
              value={desconto}
              onChange={(e) => setDesconto(Number(e.target.value))}
            />
          </label>
          <label htmlFor="observacaoVendedor" className="full">
            <span>Observações</span>
            <textarea
              id="observacaoVendedor"
              rows={3}
              placeholder="Observações internas do vendedor..."
              value={observacaoVendedor}
              onChange={(e) => setObservacaoVendedor(e.target.value)}
            />
          </label>
        </div>

        <div className="kpi-row" style={{ marginTop: 12 }}>
          <KpiCard label="Subtotal" value={formatBrl(subtotal)} />
          {desconto > 0 && <KpiCard label="Desconto" value={`- ${formatBrl(desconto)}`} tone="warn" />}
          <KpiCard label="Total" value={formatBrl(total)} tone="success" />
        </div>
      </div>

      <div className="erp-toolbar">
        <div className="toolbar-grow" />
        <Button type="button" variant="light" href="/erp/orcamentos">
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Salvando..." : "Criar orçamento"}
        </Button>
      </div>
    </form>
  );
}

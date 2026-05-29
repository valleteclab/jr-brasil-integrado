"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
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
  const [vendedor, setVendedor] = useState("");
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
          vendedor: vendedor || undefined,
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
    <form onSubmit={handleSubmit} className="op-form">
      {error && (
        <div className="alert danger">
          <strong>Erro</strong>
          <span>{error}</span>
        </div>
      )}

      <div className="op-form-grid">
        <div className="op-form-field">
          <label htmlFor="clienteId">Cliente *</label>
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
        </div>

        <div className="op-form-field">
          <label htmlFor="vendedor">Vendedor</label>
          <input
            id="vendedor"
            type="text"
            placeholder="Nome do vendedor"
            value={vendedor}
            onChange={(e) => setVendedor(e.target.value)}
          />
        </div>

        <div className="op-form-field">
          <label htmlFor="condicaoPagamento">Condição de pagamento</label>
          <input
            id="condicaoPagamento"
            type="text"
            placeholder="Ex: 30/60/90"
            value={condicaoPagamento}
            onChange={(e) => setCondicaoPagamento(e.target.value)}
          />
        </div>

        <div className="op-form-field">
          <label htmlFor="validadeDias">Validade (dias)</label>
          <input
            id="validadeDias"
            type="number"
            min={1}
            max={365}
            value={validadeDias}
            onChange={(e) => setValidadeDias(Number(e.target.value))}
          />
        </div>
      </div>

      <h3>Itens</h3>
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
      <button className="link-btn" type="button" onClick={addItem}>
        + Adicionar item
      </button>

      <div className="kpi-row">
        <div className="metric">
          <span>Subtotal</span>
          <strong>{formatBrl(subtotal)}</strong>
        </div>
        <div className="metric">
          <span>Desconto (R$)</span>
          <input
            type="number"
            min={0}
            step={0.01}
            max={subtotal}
            value={desconto}
            onChange={(e) => setDesconto(Number(e.target.value))}
            style={{ width: "120px" }}
          />
        </div>
        <div className="metric">
          <span>Total</span>
          <strong>{formatBrl(total)}</strong>
        </div>
      </div>

      <div className="op-form-field">
        <label htmlFor="observacaoVendedor">Observações</label>
        <textarea
          id="observacaoVendedor"
          rows={3}
          placeholder="Observações internas do vendedor..."
          value={observacaoVendedor}
          onChange={(e) => setObservacaoVendedor(e.target.value)}
        />
      </div>

      <div className="op-form-actions">
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

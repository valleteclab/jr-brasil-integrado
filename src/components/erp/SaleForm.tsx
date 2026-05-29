"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import type { SaleFormData } from "@/lib/services/sales";

type LineItem = {
  produtoId: string;
  quantidade: number;
  precoUnitario: number;
  desconto: number;
};

type Props = {
  formData: SaleFormData;
};

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function SaleForm({ formData }: Props) {
  const router = useRouter();
  const [clienteId, setClienteId] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [condicaoPagamento, setCondicaoPagamento] = useState("");
  const [desconto, setDesconto] = useState(0);
  const [frete, setFrete] = useState(0);
  const [linhas, setLinhas] = useState<LineItem[]>([
    { produtoId: "", quantidade: 1, precoUnitario: 0, desconto: 0 }
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const produtoMap = new Map(formData.produtos.map((p) => [p.id, p]));

  function addLinha() {
    setLinhas((prev) => [...prev, { produtoId: "", quantidade: 1, precoUnitario: 0, desconto: 0 }]);
  }

  function removeLinha(index: number) {
    setLinhas((prev) => prev.filter((_, i) => i !== index));
  }

  const updateLinha = useCallback((index: number, patch: Partial<LineItem>) => {
    setLinhas((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l;
        const updated = { ...l, ...patch };
        if (patch.produtoId !== undefined) {
          const produto = formData.produtos.find((p) => p.id === patch.produtoId);
          if (produto) updated.precoUnitario = produto.preco;
        }
        return updated;
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.produtos]);

  const subtotalLinhas = linhas.reduce(
    (sum, l) => sum + (l.quantidade * l.precoUnitario - l.desconto),
    0
  );
  const totalGeral = subtotalLinhas - desconto + frete;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!clienteId) {
      setError("Selecione um cliente.");
      return;
    }
    const itensValidos = linhas.filter((l) => l.produtoId && l.quantidade > 0);
    if (itensValidos.length === 0) {
      setError("Adicione ao menos um item com produto e quantidade.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/erp/vendas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteId,
          canal: "BALCAO",
          formaPagamento: formaPagamento || null,
          condicaoPagamento: condicaoPagamento || null,
          observacoes: observacoes || null,
          desconto,
          frete,
          itens: itensValidos.map((l) => ({
            produtoId: l.produtoId,
            quantidade: l.quantidade,
            precoUnitario: l.precoUnitario,
            desconto: l.desconto
          }))
        })
      });

      const data = (await res.json()) as { id?: string; numero?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Erro ao criar venda.");
      router.push("/erp/vendas");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar venda.");
      setSubmitting(false);
    }
  }

  return (
    <form className="op-form-stack" onSubmit={handleSubmit}>
      {error && (
        <div className="alert danger">
          <strong>Atenção</strong>
          <span>{error}</span>
        </div>
      )}

      <Card className="op-form-card">
        <h2>Dados do pedido</h2>
        <div className="op-form-grid">
          <label>
            <span>Cliente <span aria-hidden="true">*</span></span>
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} required>
              <option value="">Selecione o cliente...</option>
              {formData.clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}{c.documento ? ` — ${c.documento}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Forma de pagamento</span>
            <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
              <option value="">Não informado</option>
              <option value="DINHEIRO">Dinheiro</option>
              <option value="CARTAO_CREDITO">Cartão de crédito</option>
              <option value="CARTAO_DEBITO">Cartão de débito</option>
              <option value="PIX">Pix</option>
              <option value="BOLETO">Boleto</option>
              <option value="TRANSFERENCIA">Transferência</option>
              <option value="A_PRAZO">A prazo</option>
            </select>
          </label>

          <label>
            <span>Condição de pagamento</span>
            <input
              type="text"
              placeholder="Ex.: 30/60/90"
              value={condicaoPagamento}
              onChange={(e) => setCondicaoPagamento(e.target.value)}
            />
          </label>

          <label>
            <span>Observações</span>
            <textarea
              rows={2}
              placeholder="Observações do pedido..."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </label>
        </div>
      </Card>

      <Card className="op-form-card">
        <h2>Itens do pedido</h2>

        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th className="num">Qtd.</th>
                <th className="num">Preço unit.</th>
                <th className="num">Desconto</th>
                <th className="num">Total</th>
                <th className="actions"></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha, i) => {
                const totalLinha = linha.quantidade * linha.precoUnitario - linha.desconto;
                const produto = produtoMap.get(linha.produtoId);
                return (
                  <tr key={i}>
                    <td>
                      <select
                        value={linha.produtoId}
                        onChange={(e) => updateLinha(i, { produtoId: e.target.value })}
                        style={{ minWidth: 200 }}
                      >
                        <option value="">Selecione...</option>
                        {formData.produtos.map((p) => (
                          <option key={p.id} value={p.id}>
                            [{p.sku}] {p.nome}
                          </option>
                        ))}
                      </select>
                      {produto && (
                        <small className="block-muted">
                          Disponível: {produto.disponivel} un.
                        </small>
                      )}
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={linha.quantidade}
                        onChange={(e) =>
                          updateLinha(i, { quantidade: Math.max(1, parseInt(e.target.value, 10) || 1) })
                        }
                        style={{ width: 70 }}
                      />
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={linha.precoUnitario}
                        onChange={(e) => updateLinha(i, { precoUnitario: Number(e.target.value) || 0 })}
                        style={{ width: 110 }}
                      />
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={linha.desconto}
                        onChange={(e) => updateLinha(i, { desconto: Number(e.target.value) || 0 })}
                        style={{ width: 110 }}
                      />
                    </td>
                    <td className="num">{formatBrl(totalLinha)}</td>
                    <td className="actions">
                      {linhas.length > 1 && (
                        <button type="button" className="danger-link" onClick={() => removeLinha(i)}>
                          Remover
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 8 }}>
          <button type="button" className="link-btn" onClick={addLinha}>
            + Adicionar linha
          </button>
        </div>
      </Card>

      <Card className="op-form-card">
        <h2>Totais</h2>
        <div className="op-form-grid">
          <label>
            <span>Desconto global (R$)</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={desconto}
              onChange={(e) => setDesconto(Number(e.target.value) || 0)}
            />
          </label>
          <label>
            <span>Frete (R$)</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={frete}
              onChange={(e) => setFrete(Number(e.target.value) || 0)}
            />
          </label>
        </div>

        <div className="op-detail-list" style={{ marginTop: 12 }}>
          <div>
            <span>Subtotal</span>
            <span>{formatBrl(subtotalLinhas)}</span>
          </div>
          {desconto > 0 && (
            <div>
              <span>Desconto</span>
              <span>- {formatBrl(desconto)}</span>
            </div>
          )}
          {frete > 0 && (
            <div>
              <span>Frete</span>
              <span>+ {formatBrl(frete)}</span>
            </div>
          )}
          <div>
            <strong>Total</strong>
            <strong>{formatBrl(totalGeral)}</strong>
          </div>
        </div>
      </Card>

      <div className="op-form-actions">
        <Button type="button" variant="light" href="/erp/vendas">
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "Salvando..." : "Criar pedido"}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { KpiCard } from "@/components/shared/KpiCard";
import type { SaleFormData } from "@/lib/services/sales";
import { gerarParcelas } from "@/lib/finance/condicao-pagamento";

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
  const [vendedorId, setVendedorId] = useState("");
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
          vendedorId: vendedorId || null,
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
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="alert danger">
          <strong>Atenção</strong>
          <span>{error}</span>
        </div>
      )}

      <div className="erp-card">
        <div className="erp-card-head"><h3>Dados do pedido</h3></div>
        <div className="erp-form">
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
            <span>Vendedor</span>
            <select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
              <option value="">Sem vendedor</option>
              {formData.vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
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
              placeholder="Ex.: à vista, 30, 30/60/90 (dias)"
              list="condicoes-pagamento"
              value={condicaoPagamento}
              onChange={(e) => setCondicaoPagamento(e.target.value)}
            />
            <datalist id="condicoes-pagamento">
              <option value="À vista" />
              <option value="30" />
              <option value="30/60" />
              <option value="30/60/90" />
              <option value="0/30/60" />
            </datalist>
            <small className="block-muted">
              {totalGeral > 0
                ? `Ao confirmar: ${gerarParcelas(totalGeral, condicaoPagamento)
                    .map((p) => `${formatBrl(p.valor)} em ${p.vencimento.toLocaleDateString("pt-BR")}`)
                    .join(" · ")}`
                : "Dias de vencimento separados por barra geram parcelas no contas a receber."}
            </small>
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
      </div>

      <div className="erp-card">
        <div className="erp-card-head"><h3>Itens do pedido</h3></div>

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
          <Button type="button" variant="light" onClick={addLinha}>
            + Adicionar linha
          </Button>
        </div>
      </div>

      <div className="erp-card">
        <div className="erp-card-head"><h3>Totais</h3></div>
        <div className="erp-form">
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

        <div className="kpi-row" style={{ marginTop: 12 }}>
          <KpiCard label="Subtotal" value={formatBrl(subtotalLinhas)} />
          {desconto > 0 && <KpiCard label="Desconto" value={`- ${formatBrl(desconto)}`} tone="warn" />}
          {frete > 0 && <KpiCard label="Frete" value={`+ ${formatBrl(frete)}`} tone="info" />}
          <KpiCard label="Total" value={formatBrl(totalGeral)} tone="success" />
        </div>
      </div>

      <div className="erp-toolbar">
        <div className="toolbar-grow" />
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import type { PurchaseFormData } from "@/lib/services/purchasing";

type Props = {
  formData: PurchaseFormData;
};

type ItemLine = {
  key: number;
  produtoId: string;
  quantidade: string;
  custoUnitario: string;
};

let lineKey = 1;

function newLine(): ItemLine {
  return { key: lineKey++, produtoId: "", quantidade: "1", custoUnitario: "" };
}

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(value);
}

function parseNum(v: string) {
  return Number(v.replace(",", ".")) || 0;
}

export function PurchaseForm({ formData }: Props) {
  const router = useRouter();
  const [fornecedorId, setFornecedorId] = useState("");
  const [condicaoPagamento, setCondicaoPagamento] = useState("");
  const [previsaoEm, setPrevisaoEm] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [frete, setFrete] = useState("0");
  const [itens, setItens] = useState<ItemLine[]>([newLine()]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function addLine() {
    setItens((cur) => [...cur, newLine()]);
  }

  function removeLine(key: number) {
    setItens((cur) => cur.filter((l) => l.key !== key));
  }

  function updateLine<K extends keyof ItemLine>(key: number, field: K, value: ItemLine[K]) {
    setItens((cur) =>
      cur.map((l) => {
        if (l.key !== key) return l;
        const updated = { ...l, [field]: value };
        // Auto-fill custo from produto's ultimoCusto
        if (field === "produtoId") {
          const produto = formData.produtos.find((p) => p.id === String(value));
          if (produto && produto.ultimoCusto > 0) {
            updated.custoUnitario = String(produto.ultimoCusto).replace(".", ",");
          }
        }
        return updated;
      })
    );
  }

  const subtotal = itens.reduce((sum, l) => {
    const qty = Math.floor(parseNum(l.quantidade));
    const cost = parseNum(l.custoUnitario);
    return sum + qty * cost;
  }, 0);
  const freteNum = parseNum(frete);
  const total = subtotal + freteNum;

  async function submit() {
    if (!fornecedorId) {
      setError("Selecione um fornecedor.");
      return;
    }

    const validItens = itens.filter((l) => l.produtoId && parseNum(l.quantidade) >= 1);
    if (!validItens.length) {
      setError("Adicione ao menos um item com produto e quantidade.");
      return;
    }

    for (const l of validItens) {
      if (!Number.isInteger(parseNum(l.quantidade)) || parseNum(l.quantidade) < 1) {
        setError("A quantidade de cada item deve ser um número inteiro positivo.");
        return;
      }
    }

    setBusy(true);
    setError("");

    try {
      const payload = {
        fornecedorId,
        condicaoPagamento: condicaoPagamento.trim() || undefined,
        previsaoEm: previsaoEm || undefined,
        observacoes: observacoes.trim() || undefined,
        frete: freteNum,
        itens: validItens.map((l) => ({
          produtoId: l.produtoId,
          quantidade: Math.floor(parseNum(l.quantidade)),
          custoUnitario: parseNum(l.custoUnitario)
        }))
      };

      const res = await fetch("/api/erp/compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível criar o pedido.");
      router.push("/erp/compras");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar pedido.");
      setBusy(false);
    }
  }

  return (
    <div>
      {error && (
        <div className="alert danger"><strong>Atenção</strong><span>{error}</span></div>
      )}

      <section className="erp-card">
        <div className="erp-card-head"><h3>Dados do pedido</h3></div>
        <div className="erp-form">
          <label className="full">
            Fornecedor
            <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
              <option value="">Selecione o fornecedor...</option>
              {formData.fornecedores.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </label>
          <label>
            Condição de pagamento
            <input
              value={condicaoPagamento}
              onChange={(e) => setCondicaoPagamento(e.target.value)}
              placeholder="Ex: 30 dias, à vista..."
            />
          </label>
          <label>
            Previsão de entrega
            <input
              type="date"
              value={previsaoEm}
              onChange={(e) => setPrevisaoEm(e.target.value)}
            />
          </label>
          <label>
            Frete (R$)
            <input
              type="number"
              min={0}
              step="0.01"
              value={frete}
              onChange={(e) => setFrete(e.target.value)}
            />
          </label>
          <label className="full">
            Observações
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
            />
          </label>
        </div>
      </section>

      <section className="erp-card">
        <div className="erp-card-head">
          <h3>Itens do pedido</h3>
          <Button variant="light" type="button" onClick={addLine}>+ Adicionar item</Button>
        </div>

        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th className="num">Quantidade</th>
                <th className="num">Custo unit. (R$)</th>
                <th className="num">Total</th>
                <th className="actions">Remover</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((line) => {
                const qty = Math.floor(parseNum(line.quantidade));
                const cost = parseNum(line.custoUnitario);
                const lineTotal = qty * cost;
                return (
                  <tr key={line.key}>
                    <td>
                      <select
                        value={line.produtoId}
                        onChange={(e) => updateLine(line.key, "produtoId", e.target.value)}
                        style={{ width: "100%" }}
                      >
                        <option value="">Selecione o produto...</option>
                        {formData.produtos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} · {p.nome}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={line.quantidade}
                        onChange={(e) =>
                          updateLine(line.key, "quantidade", e.target.value)
                        }
                        style={{ width: "80px", textAlign: "right" }}
                      />
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.custoUnitario}
                        onChange={(e) =>
                          updateLine(line.key, "custoUnitario", e.target.value)
                        }
                        style={{ width: "100px", textAlign: "right" }}
                      />
                    </td>
                    <td className="num">{lineTotal > 0 ? formatBrl(lineTotal) : "—"}</td>
                    <td className="actions">
                      {itens.length > 1 && (
                        <button
                          className="danger-link"
                          type="button"
                          onClick={() => removeLine(line.key)}
                        >
                          Remover
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ textAlign: "right" }}><strong>Subtotal</strong></td>
                <td className="num"><strong>{formatBrl(subtotal)}</strong></td>
                <td />
              </tr>
              <tr>
                <td colSpan={3} style={{ textAlign: "right" }}>Frete</td>
                <td className="num">{formatBrl(freteNum)}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={3} style={{ textAlign: "right" }}><strong>Total</strong></td>
                <td className="num"><strong>{formatBrl(total)}</strong></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div className="erp-page-actions">
        <Button variant="light" href="/erp/compras">Cancelar</Button>
        <Button type="button" disabled={busy} onClick={submit}>
          {busy ? "Criando pedido..." : "Criar pedido de compra"}
        </Button>
      </div>
    </div>
  );
}

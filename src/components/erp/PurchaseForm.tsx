"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import type { PurchaseFormData } from "@/lib/services/purchasing";

type Props = {
  formData: PurchaseFormData;
  unidades?: string[];
};

const UNIDADES_FALLBACK = ["UN", "PC", "CX", "FD", "SC", "KG", "L", "M", "DZ", "CT"];

type ItemLine = {
  key: number;
  produtoId: string;
  quantidade: string;
  custoUnitario: string;
  fatorConversao: string;
  unidadeCompra: string;
};

let lineKey = 1;

function newLine(): ItemLine {
  return { key: lineKey++, produtoId: "", quantidade: "1", custoUnitario: "", fatorConversao: "1", unidadeCompra: "" };
}

function formatQty(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(value);
}

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(value);
}

function parseNum(v: string) {
  return Number(v.replace(",", ".")) || 0;
}

export function PurchaseForm({ formData, unidades = [] }: Props) {
  const router = useRouter();
  const unidadeOpcoes = unidades.length ? unidades : UNIDADES_FALLBACK;
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

  // Atalho: cadastro completo de produto (NF-e) em nova aba; depois "Atualizar" recarrega a lista.
  function abrirCadastroProduto() {
    window.open("/erp/produtos?novo=1", "_blank", "noopener");
  }

  function removeLine(key: number) {
    setItens((cur) => cur.filter((l) => l.key !== key));
  }

  function updateLine<K extends keyof ItemLine>(key: number, field: K, value: ItemLine[K]) {
    setItens((cur) =>
      cur.map((l) => {
        if (l.key !== key) return l;
        const updated = { ...l, [field]: value };
        // Auto-preenche custo, fator de conversão e unidade de compra a partir do cadastro do produto.
        if (field === "produtoId") {
          const produto = formData.produtos.find((p) => p.id === String(value));
          if (produto && produto.ultimoCusto > 0) {
            updated.custoUnitario = String(produto.ultimoCusto).replace(".", ",");
          }
          if (produto) {
            updated.fatorConversao = String(produto.fatorConversaoCompra > 0 ? produto.fatorConversaoCompra : 1).replace(".", ",");
            updated.unidadeCompra = produto.unidadeCompra || "UN";
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
          custoUnitario: parseNum(l.custoUnitario),
          fatorConversao: parseNum(l.fatorConversao) > 0 ? parseNum(l.fatorConversao) : 1,
          unidadeCompra: l.unidadeCompra || formData.produtos.find((p) => p.id === l.produtoId)?.unidadeCompra || undefined
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
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn-erp light sm" onClick={abrirCadastroProduto} title="Cadastrar produto (nova aba)">➕ Cadastrar produto</button>
            <button type="button" className="btn-erp ghost sm" onClick={() => router.refresh()} title="Atualizar a lista após cadastrar">🔄 Atualizar</button>
            <Button variant="light" type="button" onClick={addLine}>+ Adicionar item</Button>
          </span>
        </div>

        <p className="block-muted" style={{ padding: "0 16px" }}>
          Compra em fardo/caixa e vende unitário? Informe a <strong>quantidade</strong> e o <strong>custo</strong> na unidade
          que o fornecedor cobra (ex.: 1 caixa a R$ 48) e o <strong>fator de conversão</strong> (caixa de 12 ⇒ 12). Ao receber,
          o estoque entra unitário (12 un. a R$ 4) — o valor do pedido e a conta a pagar continuam pela caixa. Use fator 1 quando não há conversão.
        </p>

        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Un. compra</th>
                <th className="num">Qtd. (compra)</th>
                <th className="num">Custo unit. (R$)</th>
                <th className="num">Conversão</th>
                <th className="num">Total</th>
                <th className="actions">Remover</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((line) => {
                const qty = Math.floor(parseNum(line.quantidade));
                const cost = parseNum(line.custoUnitario);
                const lineTotal = qty * cost;
                const fator = parseNum(line.fatorConversao) > 0 ? parseNum(line.fatorConversao) : 1;
                const produtoLinha = formData.produtos.find((p) => p.id === line.produtoId);
                const unVenda = produtoLinha?.unidade || "UN";
                const unCompra = line.unidadeCompra || produtoLinha?.unidadeCompra || "compra";
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
                    <td>
                      <select
                        value={line.unidadeCompra}
                        onChange={(e) => updateLine(line.key, "unidadeCompra", e.target.value)}
                        style={{ width: "90px" }}
                      >
                        <option value="">—</option>
                        {line.unidadeCompra && !unidadeOpcoes.includes(line.unidadeCompra) && <option value={line.unidadeCompra}>{line.unidadeCompra}</option>}
                        {unidadeOpcoes.map((u) => <option key={u} value={u}>{u}</option>)}
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
                    <td className="num">
                      <input
                        type="number"
                        min={1}
                        step="0.000001"
                        value={line.fatorConversao}
                        onChange={(e) => updateLine(line.key, "fatorConversao", e.target.value)}
                        style={{ width: "70px", textAlign: "right" }}
                        title="Unidades de venda por unidade de compra"
                      />
                      {fator > 1 && qty > 0 && (
                        <small className="block-muted" style={{ display: "block" }}>
                          = {formatQty(qty * fator)} {unVenda}{cost > 0 ? ` a ${formatBrl(cost / fator)}/${unVenda}` : ""}
                        </small>
                      )}
                      {fator <= 1 && <small className="block-muted" style={{ display: "block" }}>1 {unCompra} = 1 {unVenda}</small>}
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
                <td colSpan={5} style={{ textAlign: "right" }}><strong>Subtotal</strong></td>
                <td className="num"><strong>{formatBrl(subtotal)}</strong></td>
                <td />
              </tr>
              <tr>
                <td colSpan={5} style={{ textAlign: "right" }}>Frete</td>
                <td className="num">{formatBrl(freteNum)}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={5} style={{ textAlign: "right" }}><strong>Total</strong></td>
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

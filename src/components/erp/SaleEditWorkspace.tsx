"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SaleDetail, SaleFormData } from "@/lib/services/sales";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

type Linha = {
  produtoId: string;
  sku: string;
  nome: string;
  quantidade: number;
  precoUnitario: number;
  desconto: number;
};

/**
 * Editor de pedido em 'Aguardando nota' (antes da NF). Permite acrescentar/remover itens, alterar
 * quantidade/preço/desconto, trocar cliente, condição e vendedor. Salva via PUT — o servidor faz o
 * estorno e a reaplicação transacional de estoque/financeiro/comissão.
 */
export function SaleEditWorkspace({ venda, form }: { venda: SaleDetail; form: SaleFormData }) {
  const router = useRouter();
  const [linhas, setLinhas] = useState<Linha[]>(
    venda.itens.map((i) => ({
      produtoId: i.produtoId,
      sku: i.produtoSku,
      nome: i.produtoNome,
      quantidade: i.quantidade,
      precoUnitario: i.precoUnitario,
      desconto: i.desconto
    }))
  );
  const [clienteId, setClienteId] = useState<string>(venda.clienteId ?? "");
  const [vendedorId, setVendedorId] = useState<string>("");
  const [condicaoPagamento, setCondicaoPagamento] = useState(venda.condicaoPagamento ?? "");
  const [formaPagamento, setFormaPagamento] = useState(venda.formaPagamento ?? "");
  const [observacoes, setObservacoes] = useState(venda.observacoes ?? "");
  const [desconto, setDesconto] = useState(venda.desconto);
  const [frete, setFrete] = useState(venda.frete);

  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const subtotal = useMemo(
    () => linhas.reduce((s, l) => s + (l.quantidade * l.precoUnitario - l.desconto), 0),
    [linhas]
  );
  const total = Math.max(0, subtotal - desconto + frete);

  const sugestoes = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return [];
    return form.produtos
      .filter((p) => {
        const alvo = `${p.sku} ${p.nome} ${p.gtin ?? ""} ${p.codigoOriginal ?? ""} ${p.codigoFabricante ?? ""}`.toLowerCase();
        return alvo.includes(termo);
      })
      .slice(0, 8);
  }, [busca, form.produtos]);

  function adicionar(produtoId: string) {
    const p = form.produtos.find((x) => x.id === produtoId);
    if (!p) return;
    // Bloqueia sem estoque quando a empresa não permite. A qtd já reservada por ESTE pedido
    // (venda.itens) será estornada e refeita ao salvar, então só conta o excedente sobre ela.
    const atualNoPedido = linhas.find((l) => l.produtoId === produtoId)?.quantidade ?? 0;
    const reservadoOriginal = venda.itens.find((i) => i.produtoId === produtoId)?.quantidade ?? 0;
    if (!form.permiteVendaSemEstoque && atualNoPedido + 1 - reservadoOriginal > p.disponivel) {
      setErro(
        p.disponivel <= 0 && reservadoOriginal === 0
          ? `"${p.nome}" está sem estoque (disponível 0). A empresa não aceita venda sem estoque.`
          : `Estoque insuficiente de "${p.nome}": disponível ${p.disponivel}.`
      );
      return;
    }
    setErro("");
    setBusca("");
    setLinhas((cur) => {
      const existente = cur.find((l) => l.produtoId === produtoId);
      if (existente) {
        return cur.map((l) => (l.produtoId === produtoId ? { ...l, quantidade: l.quantidade + 1 } : l));
      }
      return [...cur, { produtoId, sku: p.sku, nome: p.nome, quantidade: 1, precoUnitario: p.preco, desconto: 0 }];
    });
  }

  function atualizar(produtoId: string, campo: "quantidade" | "precoUnitario" | "desconto", valor: number) {
    setLinhas((cur) => cur.map((l) => (l.produtoId === produtoId ? { ...l, [campo]: Math.max(0, valor) } : l)));
  }

  function remover(produtoId: string) {
    setLinhas((cur) => cur.filter((l) => l.produtoId !== produtoId));
  }

  async function salvar() {
    setErro("");
    if (linhas.length === 0) {
      setErro("O pedido precisa de ao menos um item.");
      return;
    }
    if (linhas.some((l) => l.quantidade <= 0)) {
      setErro("Há item com quantidade zero. Ajuste ou remova.");
      return;
    }
    if (!window.confirm("Salvar as alterações? O estoque e o contas a receber serão reajustados conforme os novos itens.")) {
      return;
    }
    setSalvando(true);
    try {
      const res = await fetch(`/api/erp/vendas/${venda.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteId: clienteId || null,
          vendedorId: vendedorId || null,
          condicaoPagamento: condicaoPagamento.trim() || null,
          formaPagamento: formaPagamento.trim() || null,
          observacoes: observacoes.trim() || null,
          desconto,
          frete,
          itens: linhas.map((l) => ({
            produtoId: l.produtoId,
            quantidade: l.quantidade,
            precoUnitario: l.precoUnitario,
            desconto: l.desconto
          }))
        })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar a edição.");
      router.push(`/erp/vendas/${venda.id}`);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar a edição.");
      setSalvando(false);
    }
  }

  return (
    <>
      <section className="erp-card">
        <div className="erp-card-head"><div><h3>Cliente e condições</h3></div></div>
        <div className="erp-form">
          <label>Cliente
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Consumidor não identificado</option>
              {form.clientes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label>Vendedor
            <select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
              <option value="">— manter atual / nenhum —</option>
              {form.vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </label>
          <label>Condição de pagamento<input value={condicaoPagamento} onChange={(e) => setCondicaoPagamento(e.target.value)} placeholder="à vista, 30/60/90…" /></label>
          <label>Forma de pagamento<input value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} /></label>
          <label className="full">Observações<textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} /></label>
        </div>
      </section>

      <section className="erp-card">
        <div className="erp-card-head"><div><h3>Itens</h3></div></div>
        <div style={{ position: "relative", padding: "0 16px 12px" }}>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto por SKU, nome, GTIN ou código…"
            style={{ width: "100%" }}
          />
          {sugestoes.length > 0 && (
            <div className="busca-sugestoes" style={{ position: "absolute", zIndex: 5, left: 16, right: 16, background: "var(--erp-surface, #fff)", border: "1px solid var(--erp-line)", borderRadius: 6, maxHeight: 260, overflowY: "auto", boxShadow: "0 6px 18px rgba(0,0,0,.12)" }}>
              {sugestoes.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => adicionar(p.id)}
                  style={{ display: "flex", justifyContent: "space-between", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", borderBottom: "1px solid var(--erp-line)", cursor: "pointer" }}
                >
                  <span><strong className="mono">{p.sku}</strong> · {p.nome}</span>
                  <span className="block-muted">{brl(p.preco)} · {p.disponivel} disp.</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead><tr><th>SKU</th><th>Produto</th><th className="num">Qtd</th><th className="num">Preço</th><th className="num">Desc.</th><th className="num">Total</th><th></th></tr></thead>
            <tbody>
              {linhas.length === 0 && <tr><td colSpan={7} className="block-muted" style={{ textAlign: "center", padding: 16 }}>Nenhum item. Busque acima para adicionar.</td></tr>}
              {linhas.map((l) => (
                <tr key={l.produtoId}>
                  <td className="mono">{l.sku}</td>
                  <td>{l.nome}</td>
                  <td className="num"><input type="number" min={0} value={l.quantidade} onChange={(e) => atualizar(l.produtoId, "quantidade", parseFloat(e.target.value) || 0)} style={{ width: 64 }} /></td>
                  <td className="num"><input type="number" min={0} step="0.01" value={l.precoUnitario} onChange={(e) => atualizar(l.produtoId, "precoUnitario", parseFloat(e.target.value) || 0)} style={{ width: 90 }} /></td>
                  <td className="num"><input type="number" min={0} step="0.01" value={l.desconto} onChange={(e) => atualizar(l.produtoId, "desconto", parseFloat(e.target.value) || 0)} style={{ width: 80 }} /></td>
                  <td className="num">{brl(l.quantidade * l.precoUnitario - l.desconto)}</td>
                  <td className="num"><button type="button" className="btn-erp danger xs" onClick={() => remover(l.produtoId)}>remover</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="erp-form" style={{ marginTop: 8 }}>
          <label>Desconto geral (R$)<input type="number" min={0} step="0.01" value={desconto} onChange={(e) => setDesconto(parseFloat(e.target.value) || 0)} /></label>
          <label>Frete (R$)<input type="number" min={0} step="0.01" value={frete} onChange={(e) => setFrete(parseFloat(e.target.value) || 0)} /></label>
        </div>
        <div className="erp-table-foot">
          <span>Subtotal {brl(subtotal)} · Desconto {brl(desconto)} · Frete {brl(frete)}</span>
          <strong>Total: {brl(total)}</strong>
        </div>
      </section>

      {erro && <div className="alert danger" style={{ margin: "0 0 12px" }}><span>{erro}</span></div>}

      <div className="detalhe-acoes" style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn-erp ghost sm" onClick={() => router.push(`/erp/vendas/${venda.id}`)} disabled={salvando}>Cancelar</button>
        <button type="button" className="btn-erp primary sm" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar alterações"}</button>
      </div>
    </>
  );
}

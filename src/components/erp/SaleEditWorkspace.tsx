"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SaleDetail, SaleFormData } from "@/lib/services/sales";
import { NovoClienteDrawer } from "./NovoClienteDrawer";
import { AdminPasswordModal } from "./AdminPasswordModal";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const numBr = (v: string) => Number(v.replace(/\./g, "").replace(",", ".")) || 0;

type Cliente = SaleFormData["clientes"][number];

type Linha = {
  produtoId: string;
  sku: string;
  nome: string;
  unidade: string;
  quantidade: number;
  precoUnitario: number;
  /** Origem do preço da linha (VISTA/PRAZO/MANUAL) — preservada no save para a reautorização
   *  do servidor medir o desconto implícito contra a tabela certa. */
  tipoPreco: "VISTA" | "PRAZO" | "MANUAL";
  /** Desconto em PERCENTUAL (0–100). Convertido pra R$ no save (qtd×preço×pct/100). */
  descontoPct: number;
};

/**
 * Editor de pedido em 'Aguardando nota' (antes da NF). Permite acrescentar/remover itens, alterar
 * quantidade e desconto (%), trocar cliente, forma de pagamento e vendedor. Salva via PUT — o
 * servidor faz o estorno e a reaplicação transacional de estoque/financeiro/comissão.
 *
 * Decisões UI:
 *  - Desconto sempre em % (espelha o atendimento) — convertido pra R$ ao salvar.
 *  - Preço unitário é somente leitura (BRL); pra reduzir o valor, use o % de desconto.
 *  - Forma de pagamento vem das FormaPagamento cadastradas (mesmo select da venda).
 *  - Vendedor é o usuário logado (fixo) — sem seleção manual.
 *  - Cliente: atalho "+ Novo cliente" abre drawer e já seleciona o cadastrado.
 *  - "Condição de pagamento" foi removida — não fazia sentido pro usuário.
 */
export function SaleEditWorkspace({ venda, form }: { venda: SaleDetail; form: SaleFormData }) {
  const router = useRouter();
  // Backfill: desconto vem do DB em R$; converte pra % p/ exibir.
  const [linhas, setLinhas] = useState<Linha[]>(
    venda.itens.map((i) => {
      const prod = form.produtos.find((p) => p.id === i.produtoId);
      const bruto = i.quantidade * i.precoUnitario;
      const pct = bruto > 0 ? round2((i.desconto / bruto) * 100) : 0;
      return {
        produtoId: i.produtoId,
        sku: i.produtoSku,
        nome: i.produtoNome,
        unidade: prod?.unidade ?? "UN",
        quantidade: i.quantidade,
        precoUnitario: i.precoUnitario,
        tipoPreco: (i.tipoPreco === "PRAZO" || i.tipoPreco === "MANUAL" ? i.tipoPreco : "VISTA") as Linha["tipoPreco"],
        descontoPct: Math.min(100, Math.max(0, pct))
      };
    })
  );
  const [clientes, setClientes] = useState<Cliente[]>(form.clientes);
  const [clienteId, setClienteId] = useState<string>(venda.clienteId ?? "");
  const [showNovoCli, setShowNovoCli] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState(venda.formaPagamento ?? "");
  const [observacoes, setObservacoes] = useState(venda.observacoes ?? "");

  // Desconto global em % — backfill a partir do R$ persistido (sobre subtotal bruto original).
  const subtotalOriginalBruto = venda.itens.reduce((s, i) => s + i.quantidade * i.precoUnitario, 0);
  const descGlobalPctInicial = subtotalOriginalBruto > 0
    ? Math.min(100, Math.max(0, round2((venda.desconto / subtotalOriginalBruto) * 100)))
    : 0;
  const [descGlobalPct, setDescGlobalPct] = useState(descGlobalPctInicial);
  const [frete, setFrete] = useState(venda.frete);

  // Quantidade como string por linha (commit no blur) — permite "0,5" sem zerar enquanto digita.
  const [qtdInputs, setQtdInputs] = useState<Record<string, string>>({});

  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const subtotal = useMemo(
    () => linhas.reduce((s, l) => s + l.quantidade * l.precoUnitario * (1 - l.descontoPct / 100), 0),
    [linhas]
  );
  const descontoGlobalVal = round2(subtotal * (descGlobalPct / 100));
  const total = Math.max(0, round2(subtotal - descontoGlobalVal + Number(frete || 0)));

  // Auth admin: % efetivo sobre o bruto; modal abre antes do save se passar do limite.
  const [senhaAdmin, setSenhaAdmin] = useState<string>("");
  const [adminModal, setAdminModal] = useState<{ motivo: string; onOk: (senha: string) => void } | null>(null);
  const subtotalBruto = linhas.reduce((s, l) => s + l.quantidade * l.precoUnitario, 0);
  const totalLiquido = subtotal - descontoGlobalVal;
  const descontoPctEfetivo = subtotalBruto > 0 ? ((subtotalBruto - totalLiquido) / subtotalBruto) * 100 : 0;
  const limiteDescSemAuth = Number(form.descontoSemAutorizacaoPct ?? 0);
  const precisaAdmin = descontoPctEfetivo > limiteDescSemAuth + 0.01;
  function comAdmin(action: () => void) {
    if (!precisaAdmin || senhaAdmin) { action(); return; }
    setAdminModal({
      motivo: `Desconto de ${descontoPctEfetivo.toFixed(2)}% acima do limite (${limiteDescSemAuth.toFixed(2)}%). Informe a senha de um administrador.`,
      onOk: (s) => { setSenhaAdmin(s); setAdminModal(null); action(); }
    });
  }

  const sugestoes = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return [];
    return form.produtos
      .filter((p) => {
        const alvo = `${p.sku} ${p.nome} ${p.descricao ?? ""} ${p.descricaoComercial ?? ""} ${p.gtin ?? ""} ${p.codigoOriginal ?? ""} ${p.codigoFabricante ?? ""}`.toLowerCase();
        return alvo.includes(termo);
      })
      .slice(0, 8);
  }, [busca, form.produtos]);

  function adicionar(produtoId: string) {
    const p = form.produtos.find((x) => x.id === produtoId);
    if (!p) return;
    // Estoque: o já reservado por este pedido será estornado no save, então só o excedente conta.
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
      if (existente) return cur.map((l) => (l.produtoId === produtoId ? { ...l, quantidade: l.quantidade + 1 } : l));
      return [...cur, {
        produtoId, sku: p.sku, nome: p.nome, unidade: p.unidade,
        quantidade: 1, precoUnitario: p.preco, tipoPreco: "VISTA" as const, descontoPct: 0
      }];
    });
  }

  function atualizar(produtoId: string, campo: "quantidade" | "descontoPct", valor: number) {
    if (campo === "descontoPct") setSenhaAdmin("");
    setLinhas((cur) => cur.map((l) => {
      if (l.produtoId !== produtoId) return l;
      const v = Math.max(0, valor);
      if (campo === "descontoPct") return { ...l, descontoPct: Math.min(100, v) };
      return { ...l, [campo]: v };
    }));
  }

  function remover(produtoId: string) {
    setLinhas((cur) => cur.filter((l) => l.produtoId !== produtoId));
    setQtdInputs((s) => { const n = { ...s }; delete n[produtoId]; return n; });
  }

  function onClienteCriado(novo: Cliente) {
    setClientes((cur) => (cur.some((c) => c.id === novo.id) ? cur : [...cur, novo].sort((a, b) => a.label.localeCompare(b.label))));
    setClienteId(novo.id);
    setShowNovoCli(false);
  }

  // Cadastro completo de produto (NF-e) em nova aba — preserva a edição em andamento.
  function abrirCadastroProduto() {
    const nome = busca.trim();
    window.open(`/erp/produtos?novo=1${nome ? `&nome=${encodeURIComponent(nome)}` : ""}`, "_blank", "noopener");
  }

  async function salvar() {
    setErro("");
    if (linhas.length === 0) { setErro("O pedido precisa de ao menos um item."); return; }
    if (linhas.some((l) => l.quantidade <= 0)) { setErro("Há item com quantidade zero. Ajuste ou remova."); return; }
    if (!window.confirm("Salvar as alterações? O estoque e o contas a receber serão reajustados conforme os novos itens.")) return;
    setSalvando(true);
    try {
      // Converte % → R$ na hora de persistir (DB guarda em R$).
      const itensPayload = linhas.map((l) => ({
        produtoId: l.produtoId,
        quantidade: l.quantidade,
        precoUnitario: l.precoUnitario,
        tipoPreco: l.tipoPreco,
        desconto: round2(l.quantidade * l.precoUnitario * (l.descontoPct / 100))
      }));
      const res = await fetch(`/api/erp/vendas/${venda.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteId: clienteId || null,
          vendedorId: form.vendedorLogadoId || null,
          // Condição de pagamento foi removida do fluxo: envia null pra limpar o que estava.
          condicaoPagamento: null,
          formaPagamento: formaPagamento.trim() || null,
          observacoes: observacoes.trim() || null,
          desconto: descontoGlobalVal,
          frete: Number(frete) || 0,
          itens: itensPayload,
          senhaAdmin: senhaAdmin || undefined
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
          <label className="full">Cliente
            <span style={{ display: "flex", gap: 6 }}>
              <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} style={{ flex: 1 }}>
                <option value="">Consumidor não identificado</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <button type="button" className="btn-erp light sm" onClick={() => setShowNovoCli(true)} style={{ flexShrink: 0 }}>+ Novo cliente</button>
            </span>
          </label>
          <label>Forma de pagamento
            <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
              <option value="">—</option>
              {form.formas.map((f) => <option key={f.id} value={f.nome}>{f.nome}</option>)}
            </select>
          </label>
          <label>Vendedor
            <input value={form.vendedorLogadoNome ?? ""} readOnly disabled style={{ background: "var(--erp-surface,#f7f8f9)" }} />
          </label>
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
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn-erp light sm" onClick={abrirCadastroProduto}>➕ Cadastrar produto</button>
            <button type="button" className="btn-erp ghost sm" onClick={() => router.refresh()} title="Atualizar a lista após cadastrar um produto">🔄 Atualizar lista</button>
            <span className="block-muted" style={{ alignSelf: "center", fontSize: 11 }}>Cadastro completo (dados fiscais p/ NF-e) abre em nova aba; depois clique em Atualizar.</span>
          </div>
        </div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead><tr><th>SKU</th><th>Produto</th><th>Un.</th><th className="num">Qtd</th><th className="num">Preço un.</th><th className="num">% Desc.</th><th className="num">Subtotal</th><th></th></tr></thead>
            <tbody>
              {linhas.length === 0 && <tr><td colSpan={8} className="block-muted" style={{ textAlign: "center", padding: 16 }}>Nenhum item. Busque acima para adicionar.</td></tr>}
              {linhas.map((l) => {
                const sub = l.quantidade * l.precoUnitario * (1 - l.descontoPct / 100);
                const qtdStr = qtdInputs[l.produtoId] ?? String(l.quantidade).replace(".", ",");
                return (
                  <tr key={l.produtoId}>
                    <td className="mono">{l.sku}</td>
                    <td>{l.nome}</td>
                    <td className="mono" style={{ color: "var(--erp-mute)", fontSize: 12 }}>{l.unidade}</td>
                    <td className="num">
                      <input
                        inputMode="decimal"
                        value={qtdStr}
                        onChange={(e) => setQtdInputs((s) => ({ ...s, [l.produtoId]: e.target.value }))}
                        onBlur={(e) => {
                          const v = Math.max(0, numBr(e.target.value));
                          setQtdInputs((s) => { const n = { ...s }; delete n[l.produtoId]; return n; });
                          atualizar(l.produtoId, "quantidade", v);
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        style={{ width: 70, textAlign: "right" }}
                      />
                    </td>
                    <td className="num bold">{brl(l.precoUnitario)}</td>
                    <td className="num">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={l.descontoPct}
                        onChange={(e) => atualizar(l.produtoId, "descontoPct", Number(e.target.value) || 0)}
                        style={{ width: 80 }}
                      />
                    </td>
                    <td className="num">{brl(sub)}</td>
                    <td className="num"><button type="button" className="btn-erp danger xs" onClick={() => remover(l.produtoId)}>remover</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="erp-form" style={{ marginTop: 8 }}>
          <label>Desconto global (%)<input type="number" min={0} max={100} step="0.01" value={descGlobalPct} onChange={(e) => { setSenhaAdmin(""); setDescGlobalPct(Math.min(100, Math.max(0, Number(e.target.value) || 0))); }} /></label>
          <label>Frete (R$)<input type="number" min={0} step="0.01" value={frete} onChange={(e) => setFrete(parseFloat(e.target.value) || 0)} /></label>
        </div>
        <div className="erp-table-foot">
          <span>Subtotal {brl(subtotal)} · Desc. global {descGlobalPct.toFixed(2)}% ({brl(descontoGlobalVal)}) · Frete {brl(frete)}</span>
          <strong>Total: {brl(total)}</strong>
        </div>
      </section>

      {erro && <div className="alert danger" style={{ margin: "0 0 12px" }}><span>{erro}</span></div>}

      <div className="detalhe-acoes" style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn-erp ghost sm" onClick={() => router.push(`/erp/vendas/${venda.id}`)} disabled={salvando}>Cancelar</button>
        <button type="button" className="btn-erp primary sm" onClick={() => comAdmin(salvar)} disabled={salvando}>{salvando ? "Salvando…" : "Salvar alterações"}</button>
      </div>

      {showNovoCli && (
        <NovoClienteDrawer onClose={() => setShowNovoCli(false)} onCreated={onClienteCriado} />
      )}

      {adminModal && (
        <AdminPasswordModal motivo={adminModal.motivo} onAutorizado={(s) => adminModal.onOk(s)} onClose={() => setAdminModal(null)} />
      )}
    </>
  );
}

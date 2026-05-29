"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SaleFormData } from "@/lib/services/sales";

type Tipo = "VENDA_BALCAO" | "PEDIDO_FATURADO" | "ORCAMENTO" | "OS";
type Produto = SaleFormData["produtos"][number];
type Cliente = SaleFormData["clientes"][number];
type ItemLinha = { produto: Produto; quantidade: number; preco: number; desconto: number };
type Servico = { descricao: string; horas: number; valorHora: number };

const TIPOS: Array<{ id: Tipo; icon: string; label: string; desc: string }> = [
  { id: "VENDA_BALCAO", icon: "🛒", label: "Venda balcão", desc: "Saída imediata · NF + pagamento à vista" },
  { id: "PEDIDO_FATURADO", icon: "📦", label: "Pedido faturado", desc: "Faturamento com prazo · entrega ou retirada" },
  { id: "OS", icon: "🔧", label: "Ordem de Serviço", desc: "Oficina · serviços + peças aplicadas" },
  { id: "ORCAMENTO", icon: "📄", label: "Orçamento", desc: "Cotação com validade · sem baixa de estoque" }
];

const PAGAMENTOS = [
  { id: "Pix à vista", s: "Confirmação imediata" },
  { id: "Dinheiro", s: "Pagamento em espécie" },
  { id: "Cartão débito", s: "Maquininha · à vista" },
  { id: "Cartão crédito", s: "Parcelado" },
  { id: "Boleto 30 dias", s: "Faturado · sujeito a aprovação" },
  { id: "Faturado 30/60/90", s: "Cliente com limite aprovado" }
];

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export function AtendimentoWorkspace({ data, defaultTipo = "VENDA_BALCAO" }: { data: SaleFormData; defaultTipo?: Tipo }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<Tipo>(defaultTipo);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [items, setItems] = useState<ItemLinha[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [veiculo, setVeiculo] = useState({ desc: "", placa: "", km: "" });
  const [diagnostico, setDiagnostico] = useState("");
  const [pagamento, setPagamento] = useState(PAGAMENTOS[0].id);
  const [descGlobal, setDescGlobal] = useState(0);
  const [frete, setFrete] = useState(0);
  const [obs, setObs] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [condicao, setCondicao] = useState("");
  const [validadeDias, setValidadeDias] = useState(7);
  const [showCli, setShowCli] = useState(false);
  const [showProd, setShowProd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ tipo: string; total: number; route: string } | null>(null);

  const isOs = tipo === "OS";
  const isOrcamento = tipo === "ORCAMENTO";
  const isVendaPedido = tipo === "VENDA_BALCAO" || tipo === "PEDIDO_FATURADO";

  const subtotalItens = useMemo(
    () => items.reduce((s, it) => s + it.quantidade * it.preco * (1 - it.desconto / 100), 0),
    [items]
  );
  const subtotalServ = isOs ? servicos.reduce((s, sv) => s + sv.horas * sv.valorHora, 0) : 0;
  const subtotal = subtotalItens + subtotalServ;
  const descontoVal = subtotal * (descGlobal / 100);
  const total = Math.max(subtotal - descontoVal + (isVendaPedido ? Number(frete) || 0 : 0), 0);

  function addItem(p: Produto) {
    setItems((cur) => {
      const ex = cur.find((it) => it.produto.id === p.id);
      if (ex) return cur.map((it) => (it.produto.id === p.id ? { ...it, quantidade: it.quantidade + 1 } : it));
      return [...cur, { produto: p, quantidade: 1, preco: p.preco, desconto: 0 }];
    });
    setShowProd(false);
  }
  const updItem = (id: string, patch: Partial<ItemLinha>) =>
    setItems((cur) => cur.map((it) => (it.produto.id === id ? { ...it, ...patch } : it)));
  const rmItem = (id: string) => setItems((cur) => cur.filter((it) => it.produto.id !== id));

  const addServico = () => setServicos((cur) => [...cur, { descricao: "", horas: 1, valorHora: 180 }]);
  const updServ = (i: number, patch: Partial<Servico>) =>
    setServicos((cur) => cur.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const rmServ = (i: number) => setServicos((cur) => cur.filter((_, idx) => idx !== i));

  function reset() {
    setItems([]); setServicos([]); setDescGlobal(0); setFrete(0); setObs("");
    setCliente(null); setVeiculo({ desc: "", placa: "", km: "" }); setDiagnostico(""); setError("");
  }

  const canFinalize = isOs ? (servicos.length > 0 || items.length > 0) : items.length > 0 || isOrcamento;

  async function finalize() {
    setError("");
    if (!cliente) { setError("Selecione um cliente."); return; }
    if (isOs && !veiculo.desc.trim()) { setError("Informe o veículo/equipamento."); return; }
    if (!canFinalize) { setError("Adicione ao menos um item."); return; }

    setSaving(true);
    try {
      const itensPayload = items.map((it) => ({
        produtoId: it.produto.id,
        quantidade: it.quantidade,
        precoUnitario: it.preco,
        desconto: Math.round(it.quantidade * it.preco * (it.desconto / 100) * 100) / 100
      }));

      if (isOrcamento) {
        const res = await fetch("/api/erp/orcamentos", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clienteId: cliente.id, itens: itensPayload, validadeDias, desconto: descontoVal, vendedor, condicaoPagamento: condicao, observacaoVendedor: obs })
        });
        const p = await res.json();
        if (!res.ok) throw new Error(p.error || "Falha ao criar orçamento.");
        setSuccess({ tipo: "Orçamento", total, route: "/erp/orcamentos" });
      } else if (isOs) {
        const res = await fetch("/api/erp/os", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clienteId: cliente.id, equipamento: veiculo.desc, placaOuSerial: veiculo.placa, problemaRelatado: diagnostico, observacoes: obs })
        });
        const p = await res.json();
        if (!res.ok) throw new Error(p.error || "Falha ao abrir OS.");
        for (const s of servicos.filter((x) => x.descricao.trim())) {
          await fetch(`/api/erp/os/${p.id}/servico`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ descricao: s.descricao, horas: s.horas, valorHora: s.valorHora }) });
        }
        for (const it of items) {
          await fetch(`/api/erp/os/${p.id}/peca`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ produtoId: it.produto.id, quantidade: it.quantidade, precoUnitario: it.preco }) });
        }
        setSuccess({ tipo: "Ordem de serviço", total, route: p.id ? `/erp/os/${p.id}` : "/erp/os" });
      } else {
        const res = await fetch("/api/erp/vendas", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clienteId: cliente.id, canal: tipo === "VENDA_BALCAO" ? "BALCAO" : "FATURADO", itens: itensPayload, desconto: descontoVal, frete: Number(frete) || 0, formaPagamento: pagamento, condicaoPagamento: condicao, observacoes: obs })
        });
        const p = await res.json();
        if (!res.ok) throw new Error(p.error || "Falha ao concluir a venda.");
        setSuccess({ tipo: tipo === "VENDA_BALCAO" ? "Venda" : "Pedido", total, route: "/erp/vendas" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir o atendimento.");
    } finally {
      setSaving(false);
    }
  }

  const acaoLabel = !cliente ? "Selecione um cliente" : !canFinalize ? "Adicione ao menos um item"
    : tipo === "VENDA_BALCAO" ? `Finalizar venda · ${brl(total)}`
    : tipo === "PEDIDO_FATURADO" ? `Confirmar pedido · ${brl(total)}`
    : isOs ? `Abrir OS · ${brl(total)}` : `Enviar orçamento · ${brl(total)}`;

  return (
    <div style={{ paddingBottom: 40 }}>
      <div className="topbar-panel">
        <div>
          <div className="atend-crumbs">Operação / <b>Novo atendimento</b></div>
          <h1>Novo atendimento</h1>
          <p>Crie venda balcão, pedido faturado, ordem de serviço ou orçamento.</p>
        </div>
        <button type="button" className="btn-erp ghost sm" onClick={reset}>Limpar tudo</button>
      </div>

      <div className="atend-types">
        {TIPOS.map((t) => (
          <button key={t.id} type="button" className={`atend-type${tipo === t.id ? " active" : ""}`} onClick={() => setTipo(t.id)}>
            <span className="ic" aria-hidden="true">{t.icon}</span>
            <span><strong>{t.label}</strong><small>{t.desc}</small></span>
          </button>
        ))}
      </div>

      {error && <div className="alert danger"><span className="lead">Atenção:</span> {error}</div>}

      <div className="atend-grid">
        <div className="atend-main">
          {/* Cliente */}
          <div className="erp-card">
            <div className="erp-card-head">
              <h3>Cliente {!isOrcamento ? null : <span style={{ color: "var(--erp-danger)", fontSize: 11, marginLeft: 4 }}>*obrigatório</span>}</h3>
              <button type="button" className="btn-erp ghost xs" onClick={() => setShowCli(true)}>{cliente ? "Trocar" : "+ Selecionar"}</button>
            </div>
            <div className="atend-client">
              <span className="avatar" aria-hidden="true">{cliente ? "👤" : "👥"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{cliente ? cliente.label : "Consumidor final"}</strong>
                <small>{cliente?.documento || "Selecione o cliente do atendimento"}</small>
              </div>
            </div>
          </div>

          {/* OS: veículo */}
          {isOs && (
            <div className="erp-card">
              <div className="erp-card-head"><h3>Veículo / Equipamento</h3></div>
              <div className="erp-form" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
                <label className="full">Descrição (modelo, ano, série)<input value={veiculo.desc} onChange={(e) => setVeiculo({ ...veiculo, desc: e.target.value })} placeholder="Ex.: Trator John Deere 7200J · 2019" /></label>
                <label>Placa / Série<input value={veiculo.placa} onChange={(e) => setVeiculo({ ...veiculo, placa: e.target.value })} /></label>
                <label>KM / Horímetro<input value={veiculo.km} onChange={(e) => setVeiculo({ ...veiculo, km: e.target.value })} /></label>
                <label className="full">Diagnóstico inicial / problema<textarea value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} /></label>
              </div>
            </div>
          )}

          {/* OS: serviços */}
          {isOs && (
            <div className="erp-card">
              <div className="erp-card-head">
                <h3>Serviços executados</h3>
                <button type="button" className="btn-erp ghost xs" onClick={addServico}>+ Adicionar serviço</button>
              </div>
              {servicos.length === 0 ? (
                <div className="empty-st"><h4>Sem serviços</h4><p>Adicione os serviços que serão executados.</p></div>
              ) : (
                <div className="erp-table-wrap solo" style={{ borderRadius: 0, border: 0 }}>
                  <table className="erp-table">
                    <thead><tr><th style={{ width: "52%" }}>Descrição</th><th className="num">Horas</th><th className="num">Vlr/hora</th><th className="num">Subtotal</th><th className="actions" /></tr></thead>
                    <tbody>
                      {servicos.map((s, i) => (
                        <tr key={i}>
                          <td><input value={s.descricao} onChange={(e) => updServ(i, { descricao: e.target.value })} placeholder="Ex.: Balanceamento + alinhamento" style={cellInput} /></td>
                          <td className="num"><input type="number" min={0.5} step={0.5} value={s.horas} onChange={(e) => updServ(i, { horas: Number(e.target.value) })} style={cellNum} /></td>
                          <td className="num"><input type="number" value={s.valorHora} onChange={(e) => updServ(i, { valorHora: Number(e.target.value) })} style={cellNum} /></td>
                          <td className="num bold">{brl(s.horas * s.valorHora)}</td>
                          <td className="actions"><button type="button" className="btn-erp ghost xs icon-only" onClick={() => rmServ(i)}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Itens / Peças */}
          <div className="erp-card">
            <div className="erp-card-head">
              <h3>{isOs ? "Peças aplicadas" : "Itens"}</h3>
              <div className="actions">
                <button type="button" className="btn-erp ghost xs">Importar lista</button>
                <button type="button" className="btn-erp primary xs" onClick={() => setShowProd(true)}>+ Adicionar item</button>
              </div>
            </div>
            {items.length === 0 ? (
              <div className="empty-st">
                <div style={{ fontSize: 32, opacity: .5 }} aria-hidden="true">⬚</div>
                <h4 style={{ marginTop: 10 }}>Nenhum item adicionado</h4>
                <p>Busque por código, nome ou marca para incluir produtos.</p>
                <button type="button" className="btn-erp primary sm" style={{ marginTop: 8 }} onClick={() => setShowProd(true)}>+ Adicionar produto</button>
              </div>
            ) : (
              <div className="erp-table-wrap solo" style={{ borderRadius: 0, border: 0 }}>
                <table className="erp-table">
                  <thead><tr><th>SKU</th><th>Produto</th><th className="num">Qtd</th><th className="num">Preço un.</th><th className="num">% Desc.</th><th className="num">Subtotal</th><th className="actions" /></tr></thead>
                  <tbody>
                    {items.map((it) => {
                      const sub = it.quantidade * it.preco * (1 - it.desconto / 100);
                      return (
                        <tr key={it.produto.id}>
                          <td className="mono bold">{it.produto.sku}</td>
                          <td><div style={{ fontWeight: 600 }}>{it.produto.nome}</div><span className="sublabel">{it.produto.disponivel} em estoque</span></td>
                          <td className="num"><input type="number" min={1} value={it.quantidade} onChange={(e) => updItem(it.produto.id, { quantidade: Math.max(1, Number(e.target.value) || 1) })} style={cellNum} /></td>
                          <td className="num"><input type="number" value={it.preco} onChange={(e) => updItem(it.produto.id, { preco: Number(e.target.value) })} style={cellNum} /></td>
                          <td className="num"><input type="number" min={0} max={100} value={it.desconto} onChange={(e) => updItem(it.produto.id, { desconto: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} style={cellNum} /></td>
                          <td className="num bold">{brl(sub)}</td>
                          <td className="actions"><button type="button" className="btn-erp ghost xs icon-only" onClick={() => rmItem(it.produto.id)}>✕</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Observações (não-OS) */}
          {!isOs && (
            <div className="erp-card">
              <div className="erp-card-head"><h3>Observações</h3></div>
              <div className="erp-card-body"><textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Notas internas, instruções de entrega, observações ao cliente…" style={{ width: "100%", minHeight: 60, padding: "10px 12px", border: "1px solid var(--erp-line)", borderRadius: 5, fontSize: 12.5, resize: "vertical", fontFamily: "inherit" }} /></div>
            </div>
          )}
        </div>

        {/* RIGHT RAIL */}
        <aside className="atend-rail">
          <div className="erp-card">
            <div className="erp-card-head"><h3>Totais</h3></div>
            <div className="erp-card-body">
              {isOs && servicos.length > 0 && <div className="atend-total-row"><span>Serviços ({servicos.reduce((s, x) => s + x.horas, 0)}h)</span><b>{brl(subtotalServ)}</b></div>}
              <div className="atend-total-row"><span>{isOs ? "Peças" : "Itens"} ({items.reduce((s, it) => s + it.quantidade, 0)})</span><b>{brl(subtotalItens)}</b></div>
              <div className="atend-total-row"><span>Subtotal</span><b>{brl(subtotal)}</b></div>
              <div className="atend-total-row">
                <span>Desconto global</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input className="pct-input" type="number" min={0} max={100} value={descGlobal} onChange={(e) => setDescGlobal(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} /> %
                  <span style={{ minWidth: 70, textAlign: "right", color: "var(--erp-danger)", fontWeight: 600 }}>{descontoVal > 0 ? `-${brl(descontoVal)}` : "—"}</span>
                </span>
              </div>
              {isVendaPedido && (
                <div className="atend-total-row">
                  <span>Frete</span>
                  <span>R$ <input className="pct-input" style={{ width: 90 }} type="number" min={0} value={frete} onChange={(e) => setFrete(Number(e.target.value) || 0)} /></span>
                </div>
              )}
              <div className="atend-total-row grand"><span>Total</span><strong>{brl(total)}</strong></div>
            </div>
          </div>

          {isVendaPedido && (
            <div className="erp-card">
              <div className="erp-card-head"><h3>Pagamento</h3></div>
              <div className="erp-card-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {PAGAMENTOS.map((pg) => (
                  <label key={pg.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: `1px solid ${pagamento === pg.id ? "var(--erp-yellow)" : "var(--erp-line)"}`, background: pagamento === pg.id ? "rgba(255,193,7,.06)" : "#fff", borderRadius: 5, cursor: "pointer" }}>
                    <input type="radio" checked={pagamento === pg.id} onChange={() => setPagamento(pg.id)} style={{ accentColor: "var(--erp-yellow-dk)" }} />
                    <div style={{ flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 600 }}>{pg.id}</div><div style={{ fontSize: 10.5, color: "var(--erp-slate)" }}>{pg.s}</div></div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {isOrcamento && (
            <div className="erp-card">
              <div className="erp-card-head"><h3>Validade & condições</h3></div>
              <div className="erp-form" style={{ gridTemplateColumns: "1fr" }}>
                <label>Validade (dias)<input type="number" min={1} value={validadeDias} onChange={(e) => setValidadeDias(Number(e.target.value))} /></label>
                <label>Vendedor<input value={vendedor} onChange={(e) => setVendedor(e.target.value)} placeholder="Nome do vendedor" /></label>
                <label>Condição de pagamento<input value={condicao} onChange={(e) => setCondicao(e.target.value)} placeholder="Ex.: 30/60/90" /></label>
              </div>
            </div>
          )}

          {(isVendaPedido || isOs) && (
            <div className="erp-card">
              <div className="erp-card-head"><h3>{isOs ? "Atribuição" : "Condições"}</h3></div>
              <div className="erp-form" style={{ gridTemplateColumns: "1fr" }}>
                <label>{isOs ? "Vendedor / técnico" : "Vendedor"}<input value={vendedor} onChange={(e) => setVendedor(e.target.value)} placeholder="Nome" /></label>
                <label>Condição de pagamento<input value={condicao} onChange={(e) => setCondicao(e.target.value)} placeholder="Ex.: 30/60/90 ou à vista" /></label>
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button type="button" className="btn-erp primary lg" disabled={!cliente || !canFinalize || saving} onClick={finalize}>{saving ? "Processando…" : acaoLabel}</button>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn-erp ghost sm" style={{ flex: 1 }}>Imprimir</button>
              <button type="button" className="btn-erp ghost sm" style={{ flex: 1 }}>Salvar rascunho</button>
            </div>
          </div>
        </aside>
      </div>

      {/* CLIENTE PICKER */}
      {showCli && (
        <PickerDrawer title="Selecionar cliente" placeholder="Buscar por nome ou documento…" onClose={() => setShowCli(false)}
          rows={data.clientes} filter={(c, q) => c.label.toLowerCase().includes(q) || (c.documento ?? "").toLowerCase().includes(q)}
          render={(c) => (
            <tr key={c.id} onClick={() => { setCliente(c); setShowCli(false); }}>
              <td><div style={{ fontWeight: 600 }}>{c.label}</div></td>
              <td className="mono">{c.documento || "—"}</td>
            </tr>
          )}
          headers={["Cliente", "Documento"]} />
      )}

      {/* PRODUTO PICKER */}
      {showProd && (
        <PickerDrawer title="Buscar produto" placeholder="Ex.: AXE72011, cardan, John Deere…" onClose={() => setShowProd(false)}
          rows={data.produtos} filter={(p, q) => p.sku.toLowerCase().includes(q) || p.nome.toLowerCase().includes(q)}
          render={(p) => (
            <tr key={p.id} onClick={() => addItem(p)}>
              <td className="mono bold">{p.sku}</td>
              <td><div style={{ fontWeight: 600 }}>{p.nome}</div></td>
              <td className="num bold" style={{ color: p.disponivel <= 0 ? "var(--erp-danger)" : p.disponivel <= 5 ? "var(--erp-warn)" : "var(--erp-success)" }}>{p.disponivel}</td>
              <td className="num bold">{brl(p.preco)}</td>
            </tr>
          )}
          headers={["SKU", "Produto", "Estoque", "Preço"]} />
      )}

      {/* SUCCESS */}
      {success && (
        <div className="drawer-bd" style={{ display: "grid", placeItems: "center" }} onClick={() => { setSuccess(null); reset(); }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 36, maxWidth: 480, textAlign: "center" }}>
            <div style={{ width: 64, height: 64, margin: "0 auto 14px", borderRadius: "50%", background: "rgba(22,163,74,.15)", color: "var(--erp-success)", display: "grid", placeItems: "center", fontSize: 30 }} aria-hidden="true">✓</div>
            <h2 style={{ fontFamily: "Barlow Condensed", fontWeight: 800, fontSize: 26, margin: "0 0 6px" }}>{success.tipo} criada!</h2>
            <p style={{ color: "var(--erp-slate)", margin: "0 0 18px", fontSize: 13.5 }}>Total {brl(success.total)} · registrado no sistema.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button type="button" className="btn-erp ghost sm" onClick={() => { setSuccess(null); reset(); }}>Novo atendimento</button>
              <button type="button" className="btn-erp primary sm" onClick={() => router.push(success.route)}>Ver na lista →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const cellInput: React.CSSProperties = { width: "100%", height: 28, border: "1px solid var(--erp-line)", borderRadius: 4, padding: "0 8px", fontSize: 12.5 };
const cellNum: React.CSSProperties = { width: 70, height: 28, border: "1px solid var(--erp-line)", borderRadius: 4, padding: "0 6px", fontSize: 12.5, textAlign: "right" };

function PickerDrawer<T>({ title, placeholder, headers, rows, filter, render, onClose }: {
  title: string; placeholder: string; headers: string[]; rows: T[];
  filter: (row: T, q: string) => boolean; render: (row: T) => React.ReactNode; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const list = rows.filter((r) => !q || filter(r, q.toLowerCase())).slice(0, 30);
  return (
    <>
      <div className="drawer-bd" onClick={onClose} />
      <aside className="drawer" style={{ width: 640 }}>
        <header className="drawer-head"><h2>{title}</h2><button type="button" className="btn-erp ghost xs" onClick={onClose}>Fechar</button></header>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--erp-line)" }}>
          <input autoFocus placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", height: 38, padding: "0 12px", border: "1px solid var(--erp-line)", borderRadius: 6, fontSize: 13 }} />
        </div>
        <div className="drawer-body">
          <table className="erp-table">
            <thead><tr>{headers.map((h, i) => <th key={h} className={i >= headers.length - 2 && headers.length > 2 ? "num" : ""}>{h}</th>)}</tr></thead>
            <tbody>{list.map(render)}</tbody>
          </table>
          {!list.length && <div className="empty-st"><h4>Nenhum resultado</h4><p>Tente outro termo.</p></div>}
        </div>
      </aside>
    </>
  );
}

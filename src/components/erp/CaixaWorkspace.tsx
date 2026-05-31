"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CaixaPageData, PreVendaResumo } from "@/lib/services/cashier";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const FORMAS: Array<{ id: string; label: string }> = [
  { id: "DINHEIRO", label: "Dinheiro" },
  { id: "PIX", label: "Pix" },
  { id: "CARTAO_DEBITO", label: "Cartão débito" },
  { id: "CARTAO_CREDITO", label: "Cartão crédito" },
  { id: "BOLETO", label: "Boleto" },
  { id: "TRANSFERENCIA", label: "Transferência" }
];
const formaLabel = (id: string) => FORMAS.find((f) => f.id === id)?.label ?? id;

type PagamentoLinha = { uid: string; forma: string; valor: number };
const uid = () => Math.random().toString(36).slice(2, 9);

export function CaixaWorkspace({ data }: { data: CaixaPageData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [operador, setOperador] = useState("");
  const [saldoInicial, setSaldoInicial] = useState(0);

  const [sel, setSel] = useState<PreVendaResumo | null>(null);
  const [pagamentos, setPagamentos] = useState<PagamentoLinha[]>([]);
  const [modelo, setModelo] = useState<"NFCE" | "NFE">("NFCE");
  const [query, setQuery] = useState("");
  const [resultado, setResultado] = useState<{ pedidoNumero: string; troco: number; notaId: string | null; notaStatus: string | null; emitErro: string | null } | null>(null);

  const caixa = data.caixa;

  const preVendasFiltradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.preVendas;
    return data.preVendas.filter((p) =>
      [p.numero, p.clienteNome ?? "", p.clienteDocumento ?? ""].some((f) => f.toLowerCase().includes(q))
    );
  }, [query, data.preVendas]);

  const somaPago = useMemo(() => pagamentos.reduce((s, p) => s + (Number(p.valor) || 0), 0), [pagamentos]);
  const troco = sel ? Math.max(somaPago - sel.total, 0) : 0;
  const falta = sel ? Math.max(sel.total - somaPago, 0) : 0;

  async function post(url: string, body: unknown) {
    setError(""); setInfo("");
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Falha na operação.");
    return json;
  }

  async function abrir() {
    if (!operador.trim()) { setError("Informe o operador."); return; }
    setBusy(true);
    try { await post("/api/erp/caixa/abrir", { operador, saldoInicial }); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao abrir caixa."); }
    finally { setBusy(false); }
  }

  async function movimento(tipo: "SUPRIMENTO" | "SANGRIA") {
    const v = window.prompt(`Valor do ${tipo === "SANGRIA" ? "sangria (retirada)" : "suprimento (entrada)"}:`);
    if (v === null) return;
    const valor = Number(v.replace(",", "."));
    if (!valor || valor <= 0) { setError("Valor inválido."); return; }
    setBusy(true);
    try { await post("/api/erp/caixa/movimento", { tipo, valor }); setInfo(`${tipo === "SANGRIA" ? "Sangria" : "Suprimento"} registrado.`); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro no movimento."); }
    finally { setBusy(false); }
  }

  async function fechar() {
    const v = window.prompt("Valor contado em dinheiro na gaveta (vazio para pular a conferência):", "");
    if (v === null) return;
    setBusy(true);
    try {
      const r = await post("/api/erp/caixa/fechar", { saldoFinalInformado: v.trim() ? Number(v.replace(",", ".")) : undefined });
      const dif = r.diferenca as number | null;
      setInfo(dif == null ? "Caixa fechado." : `Caixa fechado. Diferença: ${brl(dif)} (${dif === 0 ? "conferido" : dif > 0 ? "sobra" : "falta"}).`);
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao fechar."); }
    finally { setBusy(false); }
  }

  async function cancelarPreVenda(p: PreVendaResumo) {
    if (!window.confirm(`Cancelar a pré-venda ${p.numero}? O estoque reservado será liberado.`)) return;
    setBusy(true);
    try {
      await post(`/api/erp/vendas/${p.id}/cancelar`, {});
      setInfo(`Pré-venda ${p.numero} cancelada e estoque liberado.`);
      if (sel?.id === p.id) setSel(null);
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao cancelar a pré-venda."); }
    finally { setBusy(false); }
  }

  function selecionar(p: PreVendaResumo) {
    setSel(p);
    setResultado(null);
    setError("");
    setModelo("NFCE");
    setPagamentos([{ uid: uid(), forma: "DINHEIRO", valor: p.total }]);
  }

  function addPagamento() { setPagamentos((cur) => [...cur, { uid: uid(), forma: "DINHEIRO", valor: falta }]); }
  const updPag = (id: string, patch: Partial<PagamentoLinha>) => setPagamentos((cur) => cur.map((p) => (p.uid === id ? { ...p, ...patch } : p)));
  const rmPag = (id: string) => setPagamentos((cur) => cur.filter((p) => p.uid !== id));

  async function receber() {
    if (!sel) return;
    if (somaPago + 0.0001 < sel.total) { setError(`Pagamento insuficiente: faltam ${brl(falta)}.`); return; }
    if (modelo === "NFE" && !sel.temCliente) { setError("NF-e exige cliente identificado. Use NFC-e para consumidor anônimo."); return; }
    setBusy(true);
    try {
      const r = await post("/api/erp/caixa/receber", {
        pedidoId: sel.id,
        modelo,
        pagamentos: pagamentos.filter((p) => Number(p.valor) > 0).map((p) => ({ forma: p.forma, valor: Number(p.valor) }))
      });
      setResultado({ pedidoNumero: r.pedidoNumero, troco: r.troco, notaId: r.nota?.id ?? null, notaStatus: r.nota?.status ?? null, emitErro: r.emitErro ?? null });
      // Impressão automática do cupom (DANFE/DANFCE) ao autorizar.
      if (r.nota?.status === "AUTORIZADA" && r.nota?.id) {
        window.open(`/api/erp/fiscal/${r.nota.id}/pdf`, "_blank", "noopener,noreferrer");
      }
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao receber."); }
    finally { setBusy(false); }
  }

  // ---- Caixa fechado: abertura ----
  if (!caixa) {
    return (
      <div style={{ paddingBottom: 40 }}>
        <div className="erp-page-head">
          <div>
            <div className="erp-crumbs">Operação <span className="sep">/</span> Caixa</div>
            <h1 className="erp-page-title">Caixa</h1>
            <p className="erp-page-sub">Nenhum caixa aberto. Abra o caixa para receber pagamentos e emitir notas.</p>
          </div>
        </div>
        {error && <div className="alert danger"><span className="lead">Atenção:</span> {error}</div>}
        <div className="erp-card" style={{ maxWidth: 460 }}>
          <div className="erp-card-head"><h3>Abrir caixa</h3></div>
          <div className="erp-form" style={{ gridTemplateColumns: "1fr" }}>
            <label>Operador<input value={operador} onChange={(e) => setOperador(e.target.value)} placeholder="Nome do operador" /></label>
            <label>Fundo de troco (R$)<input type="number" min={0} step="0.01" value={saldoInicial} onChange={(e) => setSaldoInicial(Number(e.target.value) || 0)} /></label>
            <button type="button" className="btn-erp primary lg" disabled={busy} onClick={abrir}>{busy ? "Abrindo…" : "Abrir caixa"}</button>
          </div>
        </div>
      </div>
    );
  }

  const r = caixa.resumo;

  return (
    <div style={{ paddingBottom: 40 }}>
      <div className="erp-page-head">
        <div>
          <div className="erp-crumbs">Operação <span className="sep">/</span> Caixa</div>
          <h1 className="erp-page-title">Caixa · {caixa.operador}</h1>
          <p className="erp-page-sub">Aberto em {caixa.abertoEm} · {r.qtdVendas} venda(s)</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn-erp ghost sm" disabled={busy} onClick={() => movimento("SUPRIMENTO")}>Suprimento</button>
          <button type="button" className="btn-erp ghost sm" disabled={busy} onClick={() => movimento("SANGRIA")}>Sangria</button>
          <button type="button" className="btn-erp danger sm" disabled={busy} onClick={fechar}>Fechar caixa</button>
        </div>
      </div>

      {error && <div className="alert danger"><span className="lead">Atenção:</span> {error}</div>}
      {info && <div className="alert success"><span>{info}</span></div>}

      <div className="atend-grid">
        <div className="atend-main">
          <div className="erp-card">
            <div className="erp-card-head"><h3>Pré-vendas aguardando pagamento</h3></div>
            <div className="erp-toolbar">
              <div className="toolbar-search">
                <span className="ic-sr" aria-hidden="true">⌕</span>
                <input className="search" placeholder="Buscar por nº ou cliente…" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
            </div>
            <div className="erp-table-wrap solo" style={{ borderRadius: 0, border: 0 }}>
              <table className="erp-table">
                <thead><tr><th>Pedido</th><th>Cliente</th><th className="num">Itens</th><th className="num">Total</th><th className="actions" /></tr></thead>
                <tbody>
                  {preVendasFiltradas.map((p) => (
                    <tr key={p.id} className={sel?.id === p.id ? "row-active" : ""}>
                      <td><strong className="mono">{p.numero}</strong><span className="sublabel">{p.criadoEm}</span></td>
                      <td>{p.clienteNome ?? <span style={{ color: "var(--erp-mute)" }}>Consumidor não identificado</span>}{p.clienteDocumento && <span className="sublabel">{p.clienteDocumento}</span>}</td>
                      <td className="num">{p.qtdItens}</td>
                      <td className="num bold">{brl(p.total)}</td>
                      <td className="actions">
                        <button type="button" className="btn-erp primary xs" onClick={() => selecionar(p)}>Receber</button>
                        <button type="button" className="btn-erp danger xs" disabled={busy} onClick={() => cancelarPreVenda(p)}>Cancelar</button>
                      </td>
                    </tr>
                  ))}
                  {!preVendasFiltradas.length && (
                    <tr><td colSpan={5}><div className="empty-st"><h4>Nenhuma pré-venda</h4><p>As vendas enviadas do balcão aparecem aqui para pagamento.</p></div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside className="atend-rail">
          <div className="erp-card">
            <div className="erp-card-head"><h3>Resumo do caixa</h3></div>
            <div className="erp-card-body">
              <div className="atend-total-row"><span>Fundo de troco</span><b>{brl(r.saldoInicial)}</b></div>
              <div className="atend-total-row"><span>Vendas</span><b>{brl(r.totalVendas)}</b></div>
              <div className="atend-total-row"><span>Suprimentos</span><b>{brl(r.totalSuprimentos)}</b></div>
              <div className="atend-total-row"><span>Sangrias</span><b>-{brl(r.totalSangrias)}</b></div>
              <div className="atend-total-row grand"><span>Esperado em dinheiro</span><strong>{brl(r.esperadoDinheiro)}</strong></div>
              {r.porForma.length > 0 && (
                <div style={{ marginTop: 8, borderTop: "1px solid var(--erp-line)", paddingTop: 8 }}>
                  {r.porForma.map((f) => (
                    <div key={f.forma} className="atend-total-row"><span>{formaLabel(f.forma)}</span><b>{brl(f.valor)}</b></div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {sel && !resultado && (
            <div className="erp-card">
              <div className="erp-card-head"><h3>Receber · {sel.numero}</h3></div>
              <div className="erp-card-body">
                <div className="atend-total-row grand"><span>Total</span><strong>{brl(sel.total)}</strong></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "10px 0" }}>
                  {pagamentos.map((p) => (
                    <div key={p.uid} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <select value={p.forma} onChange={(e) => updPag(p.uid, { forma: e.target.value })} style={{ flex: 1, height: 32 }}>
                        {FORMAS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                      </select>
                      <input type="number" min={0} step="0.01" value={p.valor} onChange={(e) => updPag(p.uid, { valor: Number(e.target.value) || 0 })} style={{ width: 100, height: 32, textAlign: "right" }} />
                      {pagamentos.length > 1 && <button type="button" className="btn-erp ghost xs icon-only" onClick={() => rmPag(p.uid)}>✕</button>}
                    </div>
                  ))}
                  <button type="button" className="btn-erp ghost xs" onClick={addPagamento}>+ Outra forma</button>
                </div>
                <div className="atend-total-row"><span>Recebido</span><b>{brl(somaPago)}</b></div>
                {falta > 0 ? (
                  <div className="atend-total-row"><span style={{ color: "var(--erp-danger)" }}>Falta</span><b style={{ color: "var(--erp-danger)" }}>{brl(falta)}</b></div>
                ) : (
                  <div className="atend-total-row"><span>Troco</span><b>{brl(troco)}</b></div>
                )}
                <label style={{ display: "block", margin: "10px 0 4px", fontSize: 12 }}>Documento fiscal</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" className={`btn-erp ${modelo === "NFCE" ? "primary" : "ghost"} sm`} style={{ flex: 1 }} onClick={() => setModelo("NFCE")}>NFC-e</button>
                  <button type="button" className={`btn-erp ${modelo === "NFE" ? "primary" : "ghost"} sm`} style={{ flex: 1 }} onClick={() => setModelo("NFE")} disabled={!sel.temCliente} title={!sel.temCliente ? "Requer cliente identificado" : ""}>NF-e</button>
                </div>
                <button type="button" className="btn-erp primary lg" style={{ marginTop: 12, width: "100%" }} disabled={busy || falta > 0} onClick={receber}>
                  {busy ? "Processando…" : `Receber e emitir · ${brl(sel.total)}`}
                </button>
                <button type="button" className="btn-erp ghost sm" style={{ marginTop: 6, width: "100%" }} onClick={() => setSel(null)}>Cancelar</button>
              </div>
            </div>
          )}

          {resultado && (
            <div className="erp-card">
              <div className="erp-card-head"><h3>Recebido · {resultado.pedidoNumero}</h3></div>
              <div className="erp-card-body">
                {resultado.troco > 0 && <div className="alert info"><span className="lead">Troco:</span> {brl(resultado.troco)}</div>}
                {resultado.notaStatus === "AUTORIZADA" ? (
                  <>
                    <div className="alert success"><span>Nota autorizada. O cupom foi aberto para impressão.</span></div>
                    {resultado.notaId && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <a className="btn-erp primary sm" style={{ flex: 1 }} href={`/api/erp/fiscal/${resultado.notaId}/pdf`} target="_blank" rel="noopener noreferrer">Reimprimir cupom</a>
                        <a className="btn-erp ghost sm" href={`/erp/fiscal/${resultado.notaId}`}>Ver nota</a>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="alert danger">
                    <span className="lead">Venda recebida, mas a nota não foi autorizada:</span> {resultado.emitErro || "verifique em Vendas."}
                    <div style={{ marginTop: 6 }}><a className="btn-erp primary sm" href="/erp/vendas">Reemitir em Vendas →</a></div>
                  </div>
                )}
                <button type="button" className="btn-erp ghost sm" style={{ marginTop: 8, width: "100%" }} onClick={() => { setResultado(null); setSel(null); }}>Próxima venda</button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

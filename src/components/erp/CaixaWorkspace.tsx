"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CaixaPageData, PreVendaResumo } from "@/lib/services/cashier";
import { useRealtime } from "@/lib/realtime/useRealtime";
import { ClienteCadastroDrawer, type ClienteCriado } from "./ClienteCadastroDrawer";
import { correspondeBusca } from "@/lib/search/normalize";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const FORMAS_FALLBACK: Array<{ id: string; label: string }> = [
  { id: "DINHEIRO", label: "Dinheiro" },
  { id: "PIX", label: "Pix" },
  { id: "CARTAO_DEBITO", label: "Cartão débito" },
  { id: "CARTAO_CREDITO", label: "Cartão crédito" },
  { id: "BOLETO", label: "Boleto" },
  { id: "TRANSFERENCIA", label: "Transferência" }
];

const BANDEIRAS = ["VISA", "MASTERCARD", "ELO", "AMEX", "HIPERCARD", "OUTRA"];
const isPixOuTransfer = (f: string) => f === "PIX" || f === "TRANSFERENCIA";
const isCartao = (f: string) => f === "CARTAO_DEBITO" || f === "CARTAO_CREDITO";

// Mapeia a forma escolhida no balcão (texto livre, ex.: "Pix à vista", "Cartão crédito") para o
// código de forma do caixa, pré-selecionando o que o vendedor já informou. Sem match → Dinheiro.
function formaCaixaFromLabel(label: string | null): string {
  const f = (label ?? "").toLowerCase();
  if (f.includes("pix")) return "PIX";
  if (f.includes("transfer")) return "TRANSFERENCIA";
  if (f.includes("déb") || f.includes("deb")) return "CARTAO_DEBITO";
  if (f.includes("créd") || f.includes("cred")) return "CARTAO_CREDITO";
  if (f.includes("boleto")) return "BOLETO";
  return "DINHEIRO";
}

type PagamentoLinha = {
  uid: string;
  forma: string;
  valor: number;
  contaBancariaId?: string;
  maquinaCartaoId?: string;
  nsu?: string;
  bandeira?: string;
  parcelas?: number;
};
const uid = () => Math.random().toString(36).slice(2, 9);

export function CaixaWorkspace({ data }: { data: CaixaPageData }) {
  const router = useRouter();
  const lastAutoRefreshRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [operador, setOperador] = useState("");
  const [saldoInicial, setSaldoInicial] = useState(0);

  const [sel, setSel] = useState<PreVendaResumo | null>(null);
  const [pagamentos, setPagamentos] = useState<PagamentoLinha[]>([]);
  // RECIBO = venda não fiscal (só recibo HTML). Só disponível se a empresa permitir.
  const [modelo, setModelo] = useState<"NFCE" | "NFE" | "RECIBO">("NFCE");
  const [query, setQuery] = useState("");
  const [pedidoAbertoId, setPedidoAbertoId] = useState<string | null>(null);
  const [retiradaExpedicao, setRetiradaExpedicao] = useState(false);
  const [resultado, setResultado] = useState<{ pedidoNumero: string; troco: number; notaId: string | null; notaStatus: string | null; emitErro: string | null; boleto: { valor: number; parcelas: number; boletosGerados: number; primeiroVencimento: string; aviso: string | null } | null; retirada: { id: string; codigo: string } | null } | null>(null);

  const caixa = data.caixa;

  // Formas de pagamento da EMPRESA (cadastradas) — o caixa opera por tipo (PIX→conta, cartão→máquina),
  // então deduplica por tipo. Sem formas cadastradas, cai no conjunto fixo de segurança.
  const FORMAS = data.formas.length
    ? Array.from(new Map(data.formas.map((f) => [f.tipo, { id: f.tipo, label: f.nome }])).values())
    : FORMAS_FALLBACK;
  const formaLabel = (id: string) => FORMAS.find((f) => f.id === id)?.label ?? id;

  // Identificação de cliente no caixa (consumidor antes anônimo).
  const [clientes, setClientes] = useState(data.clientes);
  const [showCliPicker, setShowCliPicker] = useState(false);
  const [cliQuery, setCliQuery] = useState("");
  const [showNovoCli, setShowNovoCli] = useState(false);
  const [idCliBusy, setIdCliBusy] = useState(false);

  useEffect(() => { setClientes(data.clientes); }, [data.clientes]);

  // Grava o cliente no pedido (endpoint leve: não mexe em estoque/financeiro) e atualiza a tela.
  async function identificarCliente(clienteId: string | null) {
    if (!sel) return;
    setIdCliBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/erp/vendas/${sel.id}/cliente`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId })
      });
      const d = (await res.json().catch(() => ({}))) as { clienteNome?: string | null; clienteDocumento?: string | null; error?: string };
      if (!res.ok) throw new Error(d.error || "Não foi possível identificar o cliente.");
      setSel((cur) => cur ? { ...cur, clienteNome: d.clienteNome ?? null, clienteDocumento: d.clienteDocumento ?? null, temCliente: Boolean(clienteId) } : cur);
      setShowCliPicker(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível identificar o cliente.");
    } finally {
      setIdCliBusy(false);
    }
  }

  function onClienteCriado(c: ClienteCriado) {
    setClientes((cur) => [{ id: c.id, label: c.label, documento: c.documento }, ...cur.filter((x) => x.id !== c.id)]);
    setShowNovoCli(false);
    void identificarCliente(c.id);
  }

  const clientesFiltrados = clientes
    .filter((c) => correspondeBusca(cliQuery, c.label, c.documento ?? ""))
    .slice(0, 50);

  // Atualiza a lista, mas nunca atrapalha quem está no meio de um recebimento.
  function refreshIfIdle() {
    if (busy || sel || resultado || document.hidden) return;
    lastAutoRefreshRef.current = Date.now();
    router.refresh();
  }

  // Tempo real: nova pré-venda enviada pelo balcão aparece na hora (sem F5).
  useRealtime(["caixa"], refreshIfIdle);

  // Fallback lento (30s): cobre o caso de o SSE cair (proxy, rede) sem martelar o servidor.
  useEffect(() => {
    const refreshFallback = () => {
      if (busy || sel || resultado || document.hidden) return;
      if (Date.now() - lastAutoRefreshRef.current < 25000) return;
      lastAutoRefreshRef.current = Date.now();
      router.refresh();
    };
    const intervalId = window.setInterval(refreshFallback, 30000);
    window.addEventListener("focus", refreshFallback);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshFallback);
    };
  }, [busy, router, resultado, sel]);

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
      const caixaId = caixa?.id;
      const r = await post("/api/erp/caixa/fechar", { saldoFinalInformado: v.trim() ? Number(v.replace(",", ".")) : undefined });
      const dif = r.diferenca as number | null;
      setInfo(dif == null ? "Caixa fechado." : `Caixa fechado. Diferença: ${brl(dif)} (${dif === 0 ? "conferido" : dif > 0 ? "sobra" : "falta"}).`);
      // Recibo de fechamento (Z) abre para impressão na térmica, como o cupom.
      if (caixaId) window.open(`/api/erp/caixa/${caixaId}/recibo`, "_blank", "noopener,noreferrer");
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
      if (pedidoAbertoId === p.id) setPedidoAbertoId(null);
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao cancelar a pré-venda."); }
    finally { setBusy(false); }
  }

  function selecionar(p: PreVendaResumo) {
    setSel(p);
    setPedidoAbertoId(p.id);
    setResultado(null);
    setError("");
    setModelo("NFCE");
    setRetiradaExpedicao(false);
    // Pré-seleciona a forma que o vendedor já informou no balcão (o operador pode trocar).
    setPagamentos([{ uid: uid(), forma: formaCaixaFromLabel(p.formaPagamento), valor: p.total }]);
  }

  function addPagamento() { setPagamentos((cur) => [...cur, { uid: uid(), forma: "DINHEIRO", valor: falta }]); }
  const updPag = (id: string, patch: Partial<PagamentoLinha>) => setPagamentos((cur) => cur.map((p) => (p.uid === id ? { ...p, ...patch } : p)));
  const rmPag = (id: string) => setPagamentos((cur) => cur.filter((p) => p.uid !== id));

  async function receber() {
    if (!sel) return;
    if (somaPago + 0.0001 < sel.total) { setError(`Pagamento insuficiente: faltam ${brl(falta)}.`); return; }
    if (modelo === "NFE" && !sel.temCliente) { setError("NF-e exige cliente identificado. Use NFC-e para consumidor anônimo."); return; }
    const isRecibo = modelo === "RECIBO";
    setBusy(true);
    try {
      const r = await post("/api/erp/caixa/receber", {
        pedidoId: sel.id,
        // Modelo "RECIBO" vira NFCE+emitirFiscal=false no servidor (placeholder ignorado).
        modelo: isRecibo ? "NFCE" : modelo,
        emitirFiscal: !isRecibo,
        pagamentos: pagamentos.filter((p) => Number(p.valor) > 0).map((p) => ({
          forma: p.forma,
          valor: Number(p.valor),
          contaBancariaId: isPixOuTransfer(p.forma) ? p.contaBancariaId ?? null : null,
          maquinaCartaoId: isCartao(p.forma) ? p.maquinaCartaoId ?? null : null,
          nsu: isCartao(p.forma) ? p.nsu ?? null : null,
          bandeira: isCartao(p.forma) ? p.bandeira ?? null : null,
          parcelas: p.forma === "CARTAO_CREDITO" ? p.parcelas ?? 1 : null
        })),
        retiradaExpedicao: data.expedicaoHabilitada && retiradaExpedicao
      });
      setResultado({ pedidoNumero: r.pedidoNumero, troco: r.troco, notaId: r.nota?.id ?? null, notaStatus: r.nota?.status ?? null, emitErro: r.emitErro ?? null, boleto: r.boleto ?? null, retirada: r.retirada ?? null });
      // Impressão automática: DANFE/DANFCE quando fiscal; recibo HTML do pedido quando não fiscal.
      if (isRecibo) {
        window.open(`/api/erp/vendas/${sel.id}/recibo`, "_blank", "noopener,noreferrer");
      } else if (r.nota?.status === "AUTORIZADA" && r.nota?.id) {
        window.open(`/api/erp/fiscal/${r.nota.id}/pdf`, "_blank", "noopener,noreferrer");
      }
      // Recibo de retirada: abre para imprimir junto com o cupom.
      if (r.retirada?.id) {
        window.open(`/api/erp/expedicao/${r.retirada.id}/recibo`, "_blank", "noopener,noreferrer");
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
                  {preVendasFiltradas.map((p) => {
                    const aberto = pedidoAbertoId === p.id;
                    return (
                    <Fragment key={p.id}>
                    <tr className={sel?.id === p.id ? "row-active" : ""}>
                      <td><strong className="mono">{p.numero}</strong><span className="sublabel">{p.criadoEm}</span></td>
                      <td>{p.clienteNome ?? <span style={{ color: "var(--erp-mute)" }}>Consumidor não identificado</span>}{p.clienteDocumento && <span className="sublabel">{p.clienteDocumento}</span>}</td>
                      <td className="num">{p.qtdItens}</td>
                      <td className="num bold">{brl(p.total)}</td>
                      <td className="actions">
                        <button type="button" className="btn-erp ghost xs" onClick={() => setPedidoAbertoId(aberto ? null : p.id)}>
                          {aberto ? "Ocultar" : "Itens"}
                        </button>
                        <button type="button" className="btn-erp primary xs" onClick={() => selecionar(p)}>Receber</button>
                        <button type="button" className="btn-erp danger xs" disabled={busy} onClick={() => cancelarPreVenda(p)}>Cancelar</button>
                      </td>
                    </tr>
                    {aberto && (
                      <tr>
                        <td colSpan={5} style={{ background: "var(--erp-soft)" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 4px" }}>
                            {p.itens.map((item) => (
                              <div
                                key={item.id}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "minmax(180px, 1fr) 70px 100px 100px",
                                  gap: 10,
                                  alignItems: "center",
                                  fontSize: 13
                                }}
                              >
                                <div>
                                  <strong>{item.produtoNome}</strong>
                                  <span className="sublabel">{item.produtoSku}</span>
                                </div>
                                <span style={{ textAlign: "right" }}>{item.quantidade} un</span>
                                <span style={{ textAlign: "right" }}>{brl(item.precoUnitario)}</span>
                                <strong style={{ textAlign: "right" }}>{brl(item.total)}</strong>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    );
                  })}
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
            <div className="erp-card-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3>Resumo do caixa</h3>
              <a className="btn-erp ghost xs" href={`/api/erp/caixa/${caixa.id}/recibo`} target="_blank" rel="noopener noreferrer" title="Imprimir o espelho do caixa sem fechar (leitura X)">🖨 Espelho (X)</a>
            </div>
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, borderBottom: "1px solid var(--erp-line)", paddingBottom: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 13 }}>
                    👤 {sel.clienteNome
                      ? <><strong>{sel.clienteNome}</strong>{sel.clienteDocumento && <span className="sublabel">{sel.clienteDocumento}</span>}</>
                      : <span style={{ color: "var(--erp-mute)" }}>Consumidor não identificado</span>}
                  </span>
                  <span style={{ display: "flex", gap: 6 }}>
                    {sel.temCliente && <button type="button" className="btn-erp ghost xs" onClick={() => identificarCliente(null)} disabled={idCliBusy}>Remover</button>}
                    <button type="button" className="btn-erp light xs" onClick={() => { setCliQuery(""); setShowCliPicker(true); }} disabled={idCliBusy}>{sel.temCliente ? "Trocar" : "Identificar cliente"}</button>
                  </span>
                </div>
                <div className="atend-total-row grand"><span>Total</span><strong>{brl(sel.total)}</strong></div>
                <div style={{ borderBottom: "1px solid var(--erp-line)", marginBottom: 10, paddingBottom: 10 }}>
                  {sel.itens.map((item) => (
                    <div key={item.id} className="atend-total-row" style={{ alignItems: "flex-start", gap: 8 }}>
                      <span>
                        <strong>{item.quantidade}x</strong> {item.produtoNome}
                        <span className="sublabel">{item.produtoSku} - {brl(item.precoUnitario)} un</span>
                      </span>
                      <b>{brl(item.total)}</b>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "10px 0" }}>
                  {pagamentos.map((p) => (
                    <div key={p.uid} style={{ display: "flex", flexDirection: "column", gap: 4, borderBottom: isPixOuTransfer(p.forma) || isCartao(p.forma) ? "1px dashed var(--erp-line)" : "none", paddingBottom: isPixOuTransfer(p.forma) || isCartao(p.forma) ? 6 : 0 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <select value={p.forma} onChange={(e) => updPag(p.uid, { forma: e.target.value, contaBancariaId: undefined, maquinaCartaoId: undefined })} style={{ flex: 1, height: 32 }}>
                          {FORMAS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                        </select>
                        <input type="number" min={0} step="0.01" value={p.valor} onChange={(e) => updPag(p.uid, { valor: Number(e.target.value) || 0 })} style={{ width: 100, height: 32, textAlign: "right" }} />
                        {pagamentos.length > 1 && <button type="button" className="btn-erp ghost xs icon-only" onClick={() => rmPag(p.uid)}>✕</button>}
                      </div>
                      {isPixOuTransfer(p.forma) && (
                        <select value={p.contaBancariaId ?? ""} onChange={(e) => updPag(p.uid, { contaBancariaId: e.target.value || undefined })} style={{ height: 30, fontSize: 12 }}>
                          <option value="">Conta recebedora…{data.contas.length ? "" : " (cadastre em Contas financeiras)"}</option>
                          {data.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.chavePix ? ` · PIX ${c.chavePix}` : ""}</option>)}
                        </select>
                      )}
                      {isCartao(p.forma) && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          <select value={p.maquinaCartaoId ?? ""} onChange={(e) => updPag(p.uid, { maquinaCartaoId: e.target.value || undefined })} style={{ flex: "1 1 100%", height: 30, fontSize: 12 }}>
                            <option value="">Maquininha…{data.maquinas.length ? "" : " (cadastre em Máquinas de cartão)"}</option>
                            {data.maquinas.map((m) => <option key={m.id} value={m.id}>{m.nome}{m.adquirente ? ` · ${m.adquirente}` : ""}</option>)}
                          </select>
                          <input placeholder="NSU" value={p.nsu ?? ""} onChange={(e) => updPag(p.uid, { nsu: e.target.value })} style={{ flex: "1 1 80px", height: 30, fontSize: 12 }} />
                          <select value={p.bandeira ?? ""} onChange={(e) => updPag(p.uid, { bandeira: e.target.value || undefined })} style={{ flex: "1 1 80px", height: 30, fontSize: 12 }}>
                            <option value="">Bandeira…</option>
                            {BANDEIRAS.map((b) => <option key={b} value={b}>{b}</option>)}
                          </select>
                          {p.forma === "CARTAO_CREDITO" && (
                            <input type="number" min={1} max={18} placeholder="Parc." value={p.parcelas ?? 1} onChange={(e) => updPag(p.uid, { parcelas: Math.max(1, Number(e.target.value) || 1) })} style={{ flex: "0 0 64px", height: 30, fontSize: 12, textAlign: "center" }} title="Parcelas" />
                          )}
                        </div>
                      )}
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
                  {data.permiteVendaNaoFiscal && (
                    <button type="button" className={`btn-erp ${modelo === "RECIBO" ? "primary" : "ghost"} sm`} style={{ flex: 1 }} onClick={() => setModelo("RECIBO")} title="Fechar a venda só com recibo (sem NF). Estoque e financeiro rodam normalmente.">Recibo</button>
                  )}
                </div>
                {data.expedicaoHabilitada && (
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13 }}>
                    <input type="checkbox" checked={retiradaExpedicao} onChange={(e) => setRetiradaExpedicao(e.target.checked)} />
                    📤 Retirada na expedição (imprime recibo)
                  </label>
                )}
                <button type="button" className="btn-erp primary lg" style={{ marginTop: 12, width: "100%" }} disabled={busy || falta > 0} onClick={receber}>
                  {busy ? "Processando…" : `${modelo === "RECIBO" ? "Receber (só recibo)" : "Receber e emitir"} · ${brl(sel.total)}`}
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
                {resultado.boleto && (
                  <div className={`alert ${resultado.boleto.aviso ? "warn" : "info"}`}>
                    <span className="lead">Boleto:</span> {brl(resultado.boleto.valor)} em {resultado.boleto.parcelas} parcela(s),
                    1º venc. {new Date(resultado.boleto.primeiroVencimento).toLocaleDateString("pt-BR")} — {resultado.boleto.boletosGerados} boleto(s) registrado(s)
                    (Financeiro → Contas a receber).
                    {resultado.boleto.aviso && <> Atenção: {resultado.boleto.aviso}</>}
                  </div>
                )}
                {resultado.retirada && (
                  <div className="alert info">
                    <span className="lead">Retirada na expedição:</span> recibo <strong style={{ letterSpacing: 2 }}>{resultado.retirada.codigo}</strong>{" "}
                    <a href={`/api/erp/expedicao/${resultado.retirada.id}/recibo`} target="_blank" rel="noopener noreferrer">(reimprimir)</a>
                  </div>
                )}
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

      {showCliPicker && (
        <>
          <div className="drawer-bd" onClick={() => setShowCliPicker(false)} />
          <aside className="drawer" style={{ width: 520 }}>
            <header className="drawer-head">
              <h2>Identificar cliente</h2>
              <button type="button" className="btn-erp ghost sm" onClick={() => setShowCliPicker(false)}>Fechar</button>
            </header>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--erp-line)" }}>
              <input autoFocus placeholder="Buscar por nome ou CPF/CNPJ…" value={cliQuery} onChange={(e) => setCliQuery(e.target.value)} style={{ width: "100%", height: 38, padding: "0 12px", border: "1px solid var(--erp-line)", borderRadius: 6, fontSize: 13 }} />
              <button type="button" className="btn-erp primary sm" style={{ marginTop: 10 }} onClick={() => setShowNovoCli(true)}>➕ Cadastrar cliente</button>
            </div>
            <div className="drawer-body">
              <table className="erp-table">
                <tbody>
                  {clientesFiltrados.map((c) => (
                    <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => identificarCliente(c.id)}>
                      <td><strong>{c.label}</strong>{c.documento && <span className="sublabel">{c.documento}</span>}</td>
                      <td className="actions"><button type="button" className="btn-erp primary xs" disabled={idCliBusy} onClick={(e) => { e.stopPropagation(); identificarCliente(c.id); }}>Selecionar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!clientesFiltrados.length && (
                <div className="empty-st">
                  <h4>Nenhum cliente</h4>
                  <p>Cadastre o cliente para identificar a venda.</p>
                  <button type="button" className="btn-erp primary sm" style={{ marginTop: 8 }} onClick={() => setShowNovoCli(true)}>➕ Cadastrar cliente</button>
                </div>
              )}
            </div>
          </aside>
        </>
      )}

      {showNovoCli && (
        <ClienteCadastroDrawer
          documentoInicial={cliQuery.replace(/\D/g, "").length >= 11 ? cliQuery.replace(/\D/g, "") : ""}
          onClose={() => setShowNovoCli(false)}
          onCreated={onClienteCriado}
        />
      )}
    </div>
  );
}

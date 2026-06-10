"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type RetiradaPendente = {
  id: string;
  codigo: string;
  status: string;
  pedidoNumero: string;
  clienteNome: string;
  qtdItens: number;
  criadoEm: string;
};

type RetiradaItem = {
  produtoId: string;
  produtoNome: string;
  produtoSku: string;
  quantidade: number;
  entregue: number;
  restante: number;
};

type RetiradaConsulta = {
  id: string;
  codigo: string;
  status: string;
  criadoEm: string;
  entreguePor: string | null;
  entregueEm: string | null;
  historico: string | null;
  pedido: {
    id: string;
    numero: string;
    total: number;
    clienteNome: string;
    notas: string[];
    itens: RetiradaItem[];
  };
};

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/**
 * Balcão de expedição: digita/escaneia o código do recibo, confere os itens e confirma a
 * entrega — total ou parcial (informando a quantidade de cada item que está saindo).
 * Recibo de outra loja, já entregue por completo ou de venda cancelada é recusado na hora.
 */
export function ExpedicaoWorkspace({ pendentes }: { pendentes: RetiradaPendente[] }) {
  const router = useRouter();
  const codigoRef = useRef<HTMLInputElement>(null);
  const [codigo, setCodigo] = useState("");
  const [conferente, setConferente] = useState("");
  const [retirada, setRetirada] = useState<RetiradaConsulta | null>(null);
  const [entregarAgora, setEntregarAgora] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sucesso, setSucesso] = useState("");

  async function consultar(codigoBusca?: string) {
    const c = (codigoBusca ?? codigo).trim();
    if (!c) { setError("Digite o código do recibo."); return; }
    setBusy(true);
    setError("");
    setSucesso("");
    setRetirada(null);
    try {
      const res = await fetch(`/api/erp/expedicao/consultar?codigo=${encodeURIComponent(c)}`);
      const data = (await res.json().catch(() => ({}))) as RetiradaConsulta & { error?: string };
      if (!res.ok) throw new Error(data.error || "Recibo não encontrado.");
      setRetirada(data);
      setCodigo(data.codigo);
      // Padrão: entregar tudo o que resta de cada item.
      setEntregarAgora(Object.fromEntries(data.pedido.itens.map((i) => [i.produtoId, i.restante])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recibo não encontrado.");
    } finally {
      setBusy(false);
    }
  }

  function setQtd(produtoId: string, max: number, raw: string) {
    const q = Math.max(0, Math.min(max, parseInt(raw, 10) || 0));
    setEntregarAgora((cur) => ({ ...cur, [produtoId]: q }));
  }

  async function entregar() {
    if (!retirada) return;
    if (!conferente.trim()) { setError("Informe o nome de quem está entregando (conferente)."); return; }
    const itens = retirada.pedido.itens
      .map((i) => ({ produtoId: i.produtoId, quantidade: entregarAgora[i.produtoId] ?? 0 }))
      .filter((i) => i.quantidade > 0);
    if (itens.length === 0) { setError("Informe a quantidade de ao menos um item para entregar."); return; }
    const totalRestante = retirada.pedido.itens.reduce((s, i) => s + i.restante, 0);
    const totalAgora = itens.reduce((s, i) => s + i.quantidade, 0);
    const parcial = totalAgora < totalRestante;
    if (!window.confirm(
      parcial
        ? `Entrega PARCIAL do pedido ${retirada.pedido.numero} (recibo ${retirada.codigo}): ${totalAgora} de ${totalRestante} itens restantes. Confirmar?`
        : `Confirmar a ENTREGA COMPLETA do pedido ${retirada.pedido.numero} (recibo ${retirada.codigo})?`
    )) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/erp/expedicao/entregar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: retirada.codigo, conferente: conferente.trim(), itens })
      });
      const data = (await res.json().catch(() => ({}))) as { completo?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível confirmar a entrega.");
      if (data.completo) {
        setSucesso(`Entrega COMPLETA do pedido ${retirada.pedido.numero} confirmada (recibo ${retirada.codigo}).`);
        setRetirada(null);
        setCodigo("");
        codigoRef.current?.focus();
      } else {
        setSucesso(`Entrega parcial registrada no recibo ${retirada.codigo} — o restante continua aguardando retirada.`);
        await consultar(retirada.codigo);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível confirmar a entrega.");
    } finally {
      setBusy(false);
    }
  }

  const emAberto = retirada?.status === "PENDENTE" || retirada?.status === "PARCIAL";
  const statusBadge =
    retirada?.status === "PENDENTE" ? <span className="status-badge warn">Aguardando retirada</span> :
    retirada?.status === "PARCIAL" ? <span className="status-badge info">Retirada parcial — há saldo</span> :
    retirada?.status === "ENTREGUE" ? <span className="status-badge success">Entregue por completo</span> :
    retirada ? <span className="status-badge danger">Cancelada</span> : null;

  return (
    <>
      {error && <div className="alert danger"><span>{error}</span></div>}
      {sucesso && <div className="alert success"><span>{sucesso}</span></div>}

      <div className="erp-card">
        <div className="erp-card-head"><h3>Conferir recibo</h3></div>
        <div className="erp-form">
          <label>
            <span>Código do recibo</span>
            <input
              ref={codigoRef}
              autoFocus
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); consultar(); } }}
              placeholder="Ex.: 7KQ2MD"
              style={{ fontFamily: "monospace", fontSize: 18, letterSpacing: 3, textTransform: "uppercase" }}
            />
          </label>
          <label>
            <span>Conferente (quem entrega)</span>
            <input value={conferente} onChange={(e) => setConferente(e.target.value)} placeholder="Seu nome" />
          </label>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button type="button" className="btn-erp primary" onClick={() => consultar()} disabled={busy}>
              {busy ? "Consultando…" : "Conferir"}
            </button>
          </div>
        </div>
      </div>

      {retirada && (
        <div className="erp-card">
          <div className="erp-card-head">
            <div>
              <h3>Recibo {retirada.codigo} · Pedido {retirada.pedido.numero}</h3>
              <span>{retirada.pedido.clienteNome} · {brl(retirada.pedido.total)}{retirada.pedido.notas.length > 0 ? ` · ${retirada.pedido.notas.join(", ")}` : ""}</span>
            </div>
            {statusBadge}
          </div>
          {retirada.status === "ENTREGUE" && (
            <div className="alert danger" style={{ margin: "0 16px 12px" }}>
              <span>Já entregue por completo em {retirada.entregueEm ? new Date(retirada.entregueEm).toLocaleString("pt-BR") : "—"} por {retirada.entreguePor ?? "—"}. NÃO entregue novamente.</span>
            </div>
          )}
          {retirada.status === "CANCELADA" && (
            <div className="alert danger" style={{ margin: "0 16px 12px" }}>
              <span>Retirada CANCELADA (venda cancelada). NÃO entregue a mercadoria.</span>
            </div>
          )}
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>SKU</th><th>Produto</th>
                  <th className="num">Total</th><th className="num">Já retirado</th><th className="num">Restante</th>
                  {emAberto && <th className="num">Entregar agora</th>}
                </tr>
              </thead>
              <tbody>
                {retirada.pedido.itens.map((i) => (
                  <tr key={i.produtoId}>
                    <td className="mono">{i.produtoSku}</td>
                    <td>{i.produtoNome}</td>
                    <td className="num">{i.quantidade}</td>
                    <td className="num">{i.entregue || "—"}</td>
                    <td className="num"><strong>{i.restante}</strong></td>
                    {emAberto && (
                      <td className="num">
                        <input
                          type="number"
                          min={0}
                          max={i.restante}
                          value={entregarAgora[i.produtoId] ?? 0}
                          onChange={(e) => setQtd(i.produtoId, i.restante, e.target.value)}
                          disabled={i.restante === 0}
                          style={{ width: 70 }}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {retirada.historico && (
            <div style={{ padding: "0 16px 12px" }}>
              <small className="block-muted" style={{ whiteSpace: "pre-line" }}>{retirada.historico}</small>
            </div>
          )}
          {emAberto && (
            <div className="detalhe-acoes" style={{ padding: 16 }}>
              <button type="button" className="btn-erp primary" onClick={entregar} disabled={busy}>
                {busy ? "Confirmando…" : "✓ Confirmar entrega"}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="erp-card">
        <div className="erp-card-head"><h3>Aguardando retirada ({pendentes.length})</h3></div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead><tr><th>Código</th><th>Pedido</th><th>Cliente</th><th className="num">Itens</th><th>Situação</th><th>Emitido</th><th className="actions"></th></tr></thead>
            <tbody>
              {pendentes.map((p) => (
                <tr key={p.id}>
                  <td className="mono"><strong>{p.codigo}</strong></td>
                  <td className="mono">{p.pedidoNumero}</td>
                  <td>{p.clienteNome}</td>
                  <td className="num">{p.qtdItens}</td>
                  <td>{p.status === "PARCIAL" ? "Parcial — há saldo" : "Pendente"}</td>
                  <td>{p.criadoEm}</td>
                  <td className="actions">
                    <button type="button" className="btn-erp ghost sm" onClick={() => consultar(p.codigo)} disabled={busy}>Conferir</button>
                  </td>
                </tr>
              ))}
              {pendentes.length === 0 && <tr><td colSpan={7} className="block-muted">Nenhuma retirada pendente.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

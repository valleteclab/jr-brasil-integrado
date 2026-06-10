"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type RetiradaPendente = {
  id: string;
  codigo: string;
  pedidoNumero: string;
  clienteNome: string;
  qtdItens: number;
  criadoEm: string;
};

type RetiradaConsulta = {
  id: string;
  codigo: string;
  status: string;
  criadoEm: string;
  entreguePor: string | null;
  entregueEm: string | null;
  pedido: {
    id: string;
    numero: string;
    total: number;
    clienteNome: string;
    notas: string[];
    itens: Array<{ produtoNome: string; produtoSku: string; quantidade: number }>;
  };
};

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/**
 * Balcão de expedição: digita/escaneia o código do recibo, confere os itens e confirma a
 * entrega. Recibo de outra loja, já entregue ou de venda cancelada é recusado na hora.
 */
export function ExpedicaoWorkspace({ pendentes }: { pendentes: RetiradaPendente[] }) {
  const router = useRouter();
  const codigoRef = useRef<HTMLInputElement>(null);
  const [codigo, setCodigo] = useState("");
  const [conferente, setConferente] = useState("");
  const [retirada, setRetirada] = useState<RetiradaConsulta | null>(null);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recibo não encontrado.");
    } finally {
      setBusy(false);
    }
  }

  async function entregar() {
    if (!retirada) return;
    if (!conferente.trim()) { setError("Informe o nome de quem está entregando (conferente)."); return; }
    if (!window.confirm(`Confirmar a ENTREGA do pedido ${retirada.pedido.numero} (recibo ${retirada.codigo})?`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/erp/expedicao/entregar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: retirada.codigo, conferente: conferente.trim() })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível confirmar a entrega.");
      setSucesso(`Entrega do pedido ${retirada.pedido.numero} confirmada (recibo ${retirada.codigo}).`);
      setRetirada(null);
      setCodigo("");
      codigoRef.current?.focus();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível confirmar a entrega.");
    } finally {
      setBusy(false);
    }
  }

  const statusBadge =
    retirada?.status === "PENDENTE" ? <span className="status-badge warn">Aguardando retirada</span> :
    retirada?.status === "ENTREGUE" ? <span className="status-badge success">Já entregue</span> :
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
              <span>Já entregue em {retirada.entregueEm ? new Date(retirada.entregueEm).toLocaleString("pt-BR") : "—"} por {retirada.entreguePor ?? "—"}. NÃO entregue novamente.</span>
            </div>
          )}
          {retirada.status === "CANCELADA" && (
            <div className="alert danger" style={{ margin: "0 16px 12px" }}>
              <span>Retirada CANCELADA (venda cancelada). NÃO entregue a mercadoria.</span>
            </div>
          )}
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead><tr><th className="num">Qtd</th><th>SKU</th><th>Produto</th></tr></thead>
              <tbody>
                {retirada.pedido.itens.map((i, idx) => (
                  <tr key={idx}>
                    <td className="num"><strong>{i.quantidade}</strong></td>
                    <td className="mono">{i.produtoSku}</td>
                    <td>{i.produtoNome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {retirada.status === "PENDENTE" && (
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
            <thead><tr><th>Código</th><th>Pedido</th><th>Cliente</th><th className="num">Itens</th><th>Emitido</th><th className="actions"></th></tr></thead>
            <tbody>
              {pendentes.map((p) => (
                <tr key={p.id}>
                  <td className="mono"><strong>{p.codigo}</strong></td>
                  <td className="mono">{p.pedidoNumero}</td>
                  <td>{p.clienteNome}</td>
                  <td className="num">{p.qtdItens}</td>
                  <td>{p.criadoEm}</td>
                  <td className="actions">
                    <button type="button" className="btn-erp ghost sm" onClick={() => consultar(p.codigo)} disabled={busy}>Conferir</button>
                  </td>
                </tr>
              ))}
              {pendentes.length === 0 && <tr><td colSpan={6} className="block-muted">Nenhuma retirada pendente.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

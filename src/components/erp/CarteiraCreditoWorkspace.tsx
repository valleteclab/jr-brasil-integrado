"use client";

import { useEffect, useState } from "react";

/**
 * Carteira de créditos de consulta (pré-pago): mostra o saldo, recarrega via Pix (Asaas) com QR +
 * copia-e-cola e confirma o pagamento automaticamente (poll a cada 4s; o webhook credita na hora).
 */

type Recarga = { id: string; valor: number; status: string; criadoEm: string; pagoEm: string | null };
type PixInfo = { id: string; valor: number; payload: string | null; qrBase64: string | null };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const VALORES = [20, 50, 100, 200];

const STATUS: Record<string, { label: string; tone: string }> = {
  PENDENTE: { label: "Aguardando pagamento", tone: "warn" },
  CONFIRMADA: { label: "Confirmada", tone: "success" },
  EXPIRADA: { label: "Expirada", tone: "danger" },
  CANCELADA: { label: "Cancelada", tone: "danger" }
};

export function CarteiraCreditoWorkspace({ saldoInicial, recargasIniciais }: { saldoInicial: number; recargasIniciais: Recarga[] }) {
  const [saldo, setSaldo] = useState(saldoInicial);
  const [recargas, setRecargas] = useState<Recarga[]>(recargasIniciais);
  const [valor, setValor] = useState(50);
  const [pix, setPix] = useState<PixInfo | null>(null);
  const [pago, setPago] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  async function atualizar() {
    try {
      const res = await fetch("/api/erp/creditos");
      const d = (await res.json().catch(() => ({}))) as { saldo?: number; recargas?: Recarga[] };
      if (res.ok) {
        if (typeof d.saldo === "number") setSaldo(d.saldo);
        if (d.recargas) setRecargas(d.recargas);
      }
    } catch { /* ignora */ }
  }

  async function recarregar() {
    if (!(valor >= 10)) { setErro("Valor mínimo de recarga: R$ 10,00."); return; }
    setBusy(true);
    setErro("");
    setPago(false);
    try {
      const res = await fetch("/api/erp/creditos/recarga", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor })
      });
      const d = (await res.json().catch(() => ({}))) as PixInfo & { error?: string };
      if (!res.ok || !d.id) throw new Error(d.error || "Não foi possível gerar a recarga.");
      setPix({ id: d.id, valor: d.valor, payload: d.payload, qrBase64: d.qrBase64 });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao gerar a recarga.");
    } finally {
      setBusy(false);
    }
  }

  // Confirmação automática: enquanto o QR está aberto e não pago, consulta o status a cada 4s.
  useEffect(() => {
    if (!pix || pago) return;
    const alvo = pix.id;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/erp/creditos/recarga/${alvo}`);
        const d = (await res.json().catch(() => ({}))) as { pago?: boolean };
        if (res.ok && d.pago) {
          setPago(true);
          await atualizar();
        }
      } catch { /* próximo tick */ }
    }, 4000);
    return () => clearInterval(t);
  }, [pix, pago]);

  return (
    <section>
      <div className="kpi-row" style={{ marginTop: 4 }}>
        <div className="kpi">
          <span className="kpi-label">Saldo de créditos</span>
          <strong style={{ fontSize: 22 }}>{brl(saldo)}</strong>
        </div>
      </div>

      <div className="erp-card" style={{ marginTop: 12, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Recarregar por Pix</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {VALORES.map((v) => (
            <button key={v} type="button" className={`btn-erp ${valor === v ? "primary" : "light"} sm`} onClick={() => setValor(v)}>{brl(v)}</button>
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            Outro valor
            <input type="number" min={10} step="10" value={valor} onChange={(e) => setValor(Number(e.target.value) || 0)} style={{ width: 110, height: 34, textAlign: "right" }} />
          </label>
          <button type="button" className="btn-erp primary sm" disabled={busy} onClick={recarregar}>
            {busy ? "Gerando…" : "▦ Gerar Pix"}
          </button>
        </div>

        {erro && <div className="alert danger" style={{ marginTop: 10 }}>{erro}</div>}

        {pix && (
          <div style={{ marginTop: 12, border: "1px solid var(--erp-line, #ddd)", borderRadius: 8, padding: 12, maxWidth: 380 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>Recarga de {brl(pix.valor)}</strong>
              <button type="button" className="btn-erp ghost xs icon-only" onClick={() => { setPix(null); setPago(false); }}>✕</button>
            </div>
            {pago ? (
              <div className="alert success" style={{ marginTop: 10 }}><strong>✓ Pago!</strong> Saldo atualizado.</div>
            ) : (
              <>
                {pix.qrBase64 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`data:image/png;base64,${pix.qrBase64}`} alt="QR Code Pix" style={{ width: 220, height: 220, alignSelf: "center", display: "block", margin: "10px auto" }} />
                ) : (
                  <div className="alert warn" style={{ marginTop: 10 }}>QR indisponível — use o copia-e-cola abaixo.</div>
                )}
                {pix.payload && (
                  <textarea readOnly value={pix.payload} rows={3} style={{ width: "100%", fontSize: 11, fontFamily: "monospace" }} onFocus={(e) => e.currentTarget.select()} title="Pix copia-e-cola" />
                )}
                <small className="block-muted" style={{ marginTop: 6 }}>Pague pelo app do banco. A confirmação é automática (não feche esta janela).</small>
              </>
            )}
          </div>
        )}
      </div>

      <div className="erp-table-wrap" style={{ marginTop: 12 }}>
        <table className="erp-table">
          <thead>
            <tr><th>Data</th><th className="num">Valor</th><th>Situação</th><th>Pago em</th></tr>
          </thead>
          <tbody>
            {recargas.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.criadoEm).toLocaleString("pt-BR")}</td>
                <td className="num">{brl(r.valor)}</td>
                <td><span className={`pill ${STATUS[r.status]?.tone ?? "mute"}`}><span className="dot" />{STATUS[r.status]?.label ?? r.status}</span></td>
                <td>{r.pagoEm ? new Date(r.pagoEm).toLocaleString("pt-BR") : "—"}</td>
              </tr>
            ))}
            {!recargas.length && <tr><td colSpan={4}><div className="empty-st"><h4>Nenhuma recarga ainda</h4></div></td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

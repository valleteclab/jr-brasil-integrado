"use client";

import { useState } from "react";
import type { CobrancaClienteRow } from "@/lib/services/platform-admin";
import { CODIGO_SERVICO_OPTIONS } from "@/domains/fiscal/codigo-tributacao-nacional";

/**
 * Painel de COBRANÇAS da plataforma (/admin/cobrancas): mensalidades por cliente com o status das
 * faturas do Asaas (pagas/pendentes/vencidas) e emissão da NFS-e da mensalidade pela empresa do
 * dono do SaaS (tomador = a empresa do cliente), para enviar junto com a cobrança.
 */

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR") : "—");

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PAGA: { label: "Paga", cls: "success" },
  PENDENTE: { label: "Pendente", cls: "warn" },
  VENCIDA: { label: "Vencida", cls: "danger" },
  OUTRA: { label: "—", cls: "mute" }
};

export function CobrancasAdminPanel({ inicial }: { inicial: CobrancaClienteRow[] }) {
  const [rows] = useState(inicial);
  const [nfseAberta, setNfseAberta] = useState<string | null>(null); // tenantId com o form aberto
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [codigo, setCodigo] = useState("");
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<Record<string, string>>({});

  function abrirNfse(r: CobrancaClienteRow) {
    setNfseAberta((cur) => (cur === r.tenantId ? null : r.tenantId));
    setValor(r.valorMensal > 0 ? String(r.valorMensal).replace(".", ",") : "");
    setDescricao("");
    setCodigo("");
  }

  async function emitir(tenantId: string) {
    setBusy(true);
    setErro((e) => ({ ...e, [tenantId]: "" }));
    setResultado((m) => ({ ...m, [tenantId]: "" }));
    try {
      const res = await fetch("/api/admin/cobrancas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          valor: Number(valor.replace(/\./g, "").replace(",", ".")) || null,
          descricao: descricao.trim() || null,
          codigoServicoLc116: codigo.trim() || null
        })
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string; status?: string; numero?: string | null; notaId?: string; erro?: string | null };
      if (!res.ok) throw new Error(d.error || "Falha ao emitir a NFS-e.");
      if (d.status === "AUTORIZADA") {
        setResultado((m) => ({ ...m, [tenantId]: `✅ NFS-e ${d.numero ?? ""} autorizada — baixe o PDF e envie junto com a cobrança.|${d.notaId}` }));
        setNfseAberta(null);
      } else {
        throw new Error(d.erro || `Nota ficou em ${d.status ?? "erro"}.`);
      }
    } catch (e) {
      setErro((m) => ({ ...m, [tenantId]: e instanceof Error ? e.message : "Falha ao emitir." }));
    } finally {
      setBusy(false);
    }
  }

  if (!rows.length) {
    return <div className="empty-st"><h4>Nenhuma cobrança</h4><p>Nenhum cliente com assinatura ou mensalidade definida.</p></div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map((r) => {
        const ultima = r.faturas[0];
        const [msgOk, notaId] = (resultado[r.tenantId] ?? "").split("|");
        return (
          <div key={r.tenantId} className="erp-card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span>
                <strong style={{ fontSize: 15 }}>{r.cliente}</strong>
                <span className="block-muted" style={{ fontSize: 12, marginLeft: 8 }}>{r.plano} · {brl(r.valorMensal)}/mês</span>
                <br />
                <span style={{ fontSize: 12.5 }}>
                  {r.temAssinatura ? (
                    <>
                      {r.vencidas > 0 && <span className="pill danger" style={{ marginRight: 6 }}><span className="dot" />{r.vencidas} vencida(s)</span>}
                      {r.pendentes > 0 && <span className="pill warn" style={{ marginRight: 6 }}><span className="dot" />{r.pendentes} pendente(s)</span>}
                      <span className="pill success"><span className="dot" />{r.pagas} paga(s)</span>
                    </>
                  ) : (
                    <span className="pill mute"><span className="dot" />Sem assinatura gerada</span>
                  )}
                  {r.erro && <span style={{ color: "#b91c1c", marginLeft: 8 }}>⚠ {r.erro}</span>}
                </span>
              </span>
              <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {ultima?.link && <a className="btn-erp light xs" href={ultima.link} target="_blank" rel="noreferrer">Última fatura ↗</a>}
                <a className="btn-erp light xs" href={`/admin/clientes/${r.tenantId}`}>Abrir cliente</a>
                <button type="button" className="btn-erp primary xs" onClick={() => abrirNfse(r)}>🧾 NFS-e da mensalidade</button>
              </span>
            </div>

            {msgOk && (
              <div className="alert success" style={{ marginTop: 10 }}>
                <span>{msgOk}</span>
                {notaId && (
                  <span style={{ marginLeft: 8 }}>
                    <a className="btn-erp light xs" href={`/api/erp/fiscal/${notaId}/pdf`} target="_blank" rel="noreferrer">⬇ PDF (DANFSE)</a>
                  </span>
                )}
              </div>
            )}
            {erro[r.tenantId] && <div className="alert danger" style={{ marginTop: 10 }}><span>{erro[r.tenantId]}</span></div>}

            {nfseAberta === r.tenantId && (
              <div style={{ marginTop: 10, background: "#f8fafc", border: "1px solid var(--erp-line)", borderRadius: 10, padding: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                <label style={{ fontSize: 12 }}>Valor (R$)
                  <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" style={{ display: "block", width: 110, height: 32, border: "1px solid var(--erp-line)", borderRadius: 6, padding: "0 8px", textAlign: "right" }} />
                </label>
                <label style={{ fontSize: 12, flex: 1, minWidth: 220 }}>Descrição (vazio = padrão com competência)
                  <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={`Assinatura mensal do sistema XERP — competência ${new Date().toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })}`} style={{ display: "block", width: "100%", height: 32, border: "1px solid var(--erp-line)", borderRadius: 6, padding: "0 8px" }} />
                </label>
                <label style={{ fontSize: 12, flex: 1, minWidth: 280 }}>Código de Tributação Nacional (serviço)
                  <select value={codigo} onChange={(e) => setCodigo(e.target.value)} style={{ display: "block", width: "100%", height: 32, border: "1px solid var(--erp-line)", borderRadius: 6, padding: "0 6px" }}>
                    <option value="">Padrão da empresa (config fiscal)</option>
                    {CODIGO_SERVICO_OPTIONS.map((o) => (
                      <option key={o.code} value={o.code}>{o.code} — {o.description}</option>
                    ))}
                  </select>
                </label>
                <button type="button" className="btn-erp primary sm" disabled={busy} onClick={() => emitir(r.tenantId)}>
                  {busy ? "Emitindo…" : "Emitir NFS-e"}
                </button>
                <span className="block-muted" style={{ fontSize: 11, flexBasis: "100%" }}>
                  A NFS-e sai pela SUA empresa (a do seu vínculo de admin), com o cliente como tomador.
                </span>
              </div>
            )}

            {r.faturas.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Faturas ({r.faturas.length})</summary>
                <table className="erp-table" style={{ marginTop: 8 }}>
                  <thead><tr><th>Vencimento</th><th className="num">Valor</th><th>Situação</th><th>Paga em</th><th /></tr></thead>
                  <tbody>
                    {r.faturas.map((f) => {
                      const b = STATUS_BADGE[f.status] ?? STATUS_BADGE.OUTRA;
                      return (
                        <tr key={f.id}>
                          <td>{dataBr(f.vencimento)}</td>
                          <td className="num">{brl(f.valor)}</td>
                          <td><span className={`pill ${b.cls}`}><span className="dot" />{b.label}</span> <small className="block-muted">{f.statusRaw}</small></td>
                          <td>{dataBr(f.pagaEm)}</td>
                          <td>{f.link && <a className="btn-erp ghost xs" href={f.link} target="_blank" rel="noreferrer">fatura ↗</a>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}

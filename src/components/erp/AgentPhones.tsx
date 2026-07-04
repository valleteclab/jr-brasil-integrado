"use client";

import { useEffect, useState } from "react";

/**
 * Telefones autorizados a operar o agente pelo WhatsApp. GESTOR pode emitir boleto/nota; VENDEDOR
 * cria rascunhos. O telefone não cadastrado que fala com o número da empresa é tratado como cliente.
 */
type Telefone = { id: string; telefone: string; nome: string | null; role: "GESTOR" | "VENDEDOR"; ativo: boolean; criadoEm: string };

const roleLabel = (r: string) => (r === "GESTOR" ? "Gestor (emite boleto/nota)" : "Vendedor (rascunhos)");
const fmtTel = (t: string) => (t.length >= 12 ? `+${t.slice(0, 2)} (${t.slice(2, 4)}) ${t.slice(4, 9)}-${t.slice(9)}` : t);

export function AgentPhones() {
  const [rows, setRows] = useState<Telefone[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ telefone: "", nome: "", role: "VENDEDOR" });

  async function carregar() {
    setLoading(true);
    try {
      const res = await fetch("/api/erp/configuracoes/agente/telefones");
      const data = (await res.json()) as { telefones?: Telefone[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Falha ao carregar.");
      setRows(data.telefones ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void carregar(); }, []);

  async function adicionar() {
    setBusy(true); setErro(""); setOk("");
    try {
      const res = await fetch("/api/erp/configuracoes/agente/telefones", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível autorizar o telefone.");
      setOk("Telefone autorizado.");
      setForm({ telefone: "", nome: "", role: "VENDEDOR" });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao autorizar.");
    } finally { setBusy(false); }
  }

  async function alternar(t: Telefone) {
    await fetch(`/api/erp/configuracoes/agente/telefones/${t.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: !t.ativo })
    });
    await carregar();
  }
  async function mudarPapel(t: Telefone, role: string) {
    await fetch(`/api/erp/configuracoes/agente/telefones/${t.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role })
    });
    await carregar();
  }
  async function remover(t: Telefone) {
    if (!window.confirm(`Remover ${fmtTel(t.telefone)} dos telefones autorizados?`)) return;
    await fetch(`/api/erp/configuracoes/agente/telefones/${t.id}`, { method: "DELETE" });
    await carregar();
  }

  return (
    <section className="erp-card" style={{ marginTop: 24 }}>
      <div className="erp-card-head"><h3>📱 Telefones autorizados (agente no WhatsApp)</h3></div>
      <div style={{ padding: "0 16px 8px", fontSize: 13, color: "var(--erp-slate)" }}>
        <p style={{ marginTop: 8 }}>
          Cadastre os números que podem operar a empresa conversando com o assistente no WhatsApp.
          <strong> Gestor</strong> pode emitir boleto, cobrar Pix, faturar venda e emitir NF-e/NFS-e (com confirmação);
          <strong> Vendedor</strong> consulta e cria rascunhos. Quem não estiver aqui é tratado como cliente.
        </p>
      </div>

      {erro && <div className="alert danger" style={{ margin: 12 }}><span className="lead">Erro:</span><span>{erro}</span></div>}
      {ok && <div className="alert success" style={{ margin: 12 }}><span className="lead">OK:</span><span>{ok}</span></div>}

      <div className="erp-form" style={{ padding: "0 16px 12px", gridTemplateColumns: "1fr 1fr 1fr auto", alignItems: "end", gap: 10 }}>
        <label>WhatsApp (com DDD)<input inputMode="numeric" value={form.telefone} onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))} placeholder="41999998888" /></label>
        <label>Nome (opcional)<input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Ex.: João (gerente)" /></label>
        <label>Papel<select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}><option value="VENDEDOR">Vendedor (rascunhos)</option><option value="GESTOR">Gestor (emite boleto/nota)</option></select></label>
        <button type="button" className="btn-erp primary sm" disabled={busy || !form.telefone.trim()} onClick={adicionar}>{busy ? "Autorizando…" : "+ Autorizar"}</button>
      </div>

      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead><tr><th>Telefone</th><th>Nome</th><th>Papel</th><th>Situação</th><th className="actions">Ações</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5}>Carregando…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={5}><div className="empty-st"><span>Nenhum telefone autorizado ainda.</span></div></td></tr>}
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="mono">{fmtTel(t.telefone)}</td>
                <td>{t.nome ?? "—"}</td>
                <td>
                  <select value={t.role} onChange={(e) => mudarPapel(t, e.target.value)} style={{ fontSize: 12 }}>
                    <option value="VENDEDOR">{roleLabel("VENDEDOR")}</option>
                    <option value="GESTOR">{roleLabel("GESTOR")}</option>
                  </select>
                </td>
                <td><span className={`pill ${t.ativo ? "success" : "mute"}`}><span className="dot" />{t.ativo ? "Ativo" : "Inativo"}</span></td>
                <td className="actions">
                  <button type="button" className="btn-erp ghost xs" onClick={() => alternar(t)}>{t.ativo ? "Desativar" : "Ativar"}</button>
                  <button type="button" className="btn-erp danger xs" onClick={() => remover(t)}>Remover</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

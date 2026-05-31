"use client";

import { useEffect, useState } from "react";

type Cfg = { ativo: boolean; instanceId: string; temToken: boolean; temClientToken: boolean; atenderClientes: boolean };
type Telefone = { id: string; telefone: string; nome: string | null; role: "GESTOR" | "VENDEDOR" | "CLIENTE"; ativo: boolean; criadoEm: string };

export function WhatsappSettings() {
  const [cfg, setCfg] = useState<Cfg>({ ativo: false, instanceId: "", temToken: false, temClientToken: false, atenderClientes: true });
  const [token, setToken] = useState("");
  const [clientToken, setClientToken] = useState("");
  const [telefones, setTelefones] = useState<Telefone[]>([]);
  const [novoTel, setNovoTel] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [novoRole, setNovoRole] = useState<"GESTOR" | "VENDEDOR">("VENDEDOR");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function carregar() {
    try {
      const [c, t] = await Promise.all([
        fetch("/api/erp/configuracoes/whatsapp").then((r) => r.json()),
        fetch("/api/erp/configuracoes/whatsapp/telefones").then((r) => r.json())
      ]);
      if (c && !c.error) setCfg(c);
      if (t?.telefones) setTelefones(t.telefones);
    } catch { /* silencioso */ }
  }
  useEffect(() => { void carregar(); }, []);

  async function salvar() {
    setBusy(true); setError(""); setMsg("");
    try {
      const res = await fetch("/api/erp/configuracoes/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ativo: cfg.ativo,
          instanceId: cfg.instanceId,
          token: token || undefined,
          clientToken: clientToken || undefined,
          atenderClientes: cfg.atenderClientes
        })
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
      setMsg("Configuração do WhatsApp salva.");
      setToken(""); setClientToken("");
      await carregar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally { setBusy(false); }
  }

  async function addTelefone() {
    setError(""); setMsg("");
    if (novoTel.replace(/\D/g, "").length < 10) { setError("Informe um telefone com DDD."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/erp/configuracoes/whatsapp/telefones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone: novoTel, nome: novoNome, role: novoRole })
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível cadastrar.");
      setNovoTel(""); setNovoNome("");
      await carregar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível cadastrar.");
    } finally { setBusy(false); }
  }

  async function removerTelefone(id: string) {
    if (!window.confirm("Remover este telefone autorizado?")) return;
    setBusy(true);
    try {
      await fetch(`/api/erp/configuracoes/whatsapp/telefones/${id}`, { method: "DELETE" });
      await carregar();
    } finally { setBusy(false); }
  }

  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/whatsapp` : "/api/webhooks/whatsapp";

  return (
    <>
      <div className="erp-card">
        <div className="erp-card-head"><h3>WhatsApp (Z-API)</h3></div>
        <div className="erp-card-body">
          <p style={{ fontSize: 12.5, color: "var(--erp-mute)", margin: "0 0 12px" }}>
            Conecte sua instância Z-API para o agente atender pelo WhatsApp. As credenciais são
            guardadas criptografadas. Configure na Z-API o webhook <b>&quot;Ao receber&quot;</b> apontando para:
            <br /><span className="mono" style={{ wordBreak: "break-all" }}>{webhookUrl}</span>
          </p>
          {error && <div className="alert danger" style={{ marginBottom: 10 }}><span>{error}</span></div>}
          {msg && <div className="alert success" style={{ marginBottom: 10 }}><span>{msg}</span></div>}
          <div className="erp-form">
            <label className="check-row">
              <input type="checkbox" checked={cfg.ativo} onChange={(e) => setCfg({ ...cfg, ativo: e.target.checked })} />
              Ativar atendimento por WhatsApp
            </label>
            <label className="check-row">
              <input type="checkbox" checked={cfg.atenderClientes} onChange={(e) => setCfg({ ...cfg, atenderClientes: e.target.checked })} />
              Atender clientes finais (autoatendimento dos próprios pedidos)
            </label>
            <label>Instance ID
              <input value={cfg.instanceId} onChange={(e) => setCfg({ ...cfg, instanceId: e.target.value })} placeholder="ID da instância Z-API" />
            </label>
            <label>Token{cfg.temToken ? " (já salvo)" : ""}
              <input value={token} onChange={(e) => setToken(e.target.value)} placeholder={cfg.temToken ? "Manter token atual" : "Token da instância"} />
            </label>
            <label>Client-Token{cfg.temClientToken ? " (já salvo)" : ""}
              <input value={clientToken} onChange={(e) => setClientToken(e.target.value)} placeholder={cfg.temClientToken ? "Manter atual" : "Client-Token da conta (segurança)"} />
            </label>
          </div>
          <div className="erp-toolbar" style={{ borderBottom: "none", paddingBottom: 0, marginTop: 8 }}>
            <div className="grow" />
            <button type="button" className="btn-erp primary sm" disabled={busy} onClick={salvar}>{busy ? "Salvando…" : "Salvar"}</button>
          </div>
        </div>
      </div>

      <div className="erp-card" style={{ marginTop: 16 }}>
        <div className="erp-card-head"><h3>Telefones autorizados (vendedor/gestor)</h3></div>
        <div className="erp-card-body">
          <p style={{ fontSize: 12.5, color: "var(--erp-mute)", margin: "0 0 12px" }}>
            Telefones que podem operar o agente (consultar e criar rascunhos). Clientes finais não
            precisam estar aqui — são reconhecidos pelo WhatsApp do cadastro.
          </p>
          <div className="erp-form" style={{ gridTemplateColumns: "1.4fr 1.4fr 1fr auto", alignItems: "end" }}>
            <label>Telefone (com DDD)
              <input value={novoTel} onChange={(e) => setNovoTel(e.target.value)} placeholder="Ex.: 77999999999" />
            </label>
            <label>Nome
              <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome do operador" />
            </label>
            <label>Papel
              <select value={novoRole} onChange={(e) => setNovoRole(e.target.value as "GESTOR" | "VENDEDOR")}>
                <option value="VENDEDOR">Vendedor</option>
                <option value="GESTOR">Gestor</option>
              </select>
            </label>
            <button type="button" className="btn-erp primary sm" disabled={busy} onClick={addTelefone}>Adicionar</button>
          </div>
          {telefones.length > 0 && (
            <div className="erp-table-wrap solo" style={{ marginTop: 12, border: 0, borderRadius: 0 }}>
              <table className="erp-table">
                <thead><tr><th>Telefone</th><th>Nome</th><th>Papel</th><th className="actions" /></tr></thead>
                <tbody>
                  {telefones.map((t) => (
                    <tr key={t.id}>
                      <td className="mono">{t.telefone}</td>
                      <td>{t.nome ?? "—"}</td>
                      <td>{t.role}</td>
                      <td className="actions"><button type="button" className="btn-erp danger xs" disabled={busy} onClick={() => removerTelefone(t.id)}>Remover</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

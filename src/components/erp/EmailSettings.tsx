"use client";

import { useEffect, useState } from "react";

type Cfg = {
  ativo: boolean;
  host: string;
  porta: number;
  seguro: boolean;
  usuario: string;
  temSenha: boolean;
  remetenteNome: string;
  remetenteEmail: string;
};

/**
 * Configuração de E-MAIL (SMTP) da empresa — usada para enviar orçamentos, boletos e notas
 * fiscais ao cliente final. Espelha o padrão da tela do WhatsApp (senha criptografada no servidor).
 */
export function EmailSettings() {
  const [cfg, setCfg] = useState<Cfg>({ ativo: false, host: "", porta: 587, seguro: false, usuario: "", temSenha: false, remetenteNome: "", remetenteEmail: "" });
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function carregar() {
    try {
      const c = await fetch("/api/erp/configuracoes/email").then((r) => r.json());
      if (c && !c.error) setCfg(c);
    } catch { /* silencioso */ }
  }
  useEffect(() => { void carregar(); }, []);

  async function salvar() {
    setBusy(true); setError(""); setMsg("");
    try {
      const res = await fetch("/api/erp/configuracoes/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ativo: cfg.ativo,
          host: cfg.host,
          porta: cfg.porta,
          seguro: cfg.seguro,
          usuario: cfg.usuario,
          senha: senha || undefined,
          remetenteNome: cfg.remetenteNome,
          remetenteEmail: cfg.remetenteEmail
        })
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
      setMsg("Configuração de e-mail salva.");
      setSenha("");
      await carregar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally { setBusy(false); }
  }

  return (
    <div className="erp-card">
      <div className="erp-card-head"><h3>E-mail (SMTP)</h3></div>
      <div className="erp-card-body">
        <p style={{ fontSize: 12.5, color: "var(--erp-mute)", margin: "0 0 12px" }}>
          Servidor SMTP usado para enviar orçamentos, boletos e notas fiscais ao cliente. Funciona com
          Gmail, Hostinger, Locaweb, Amazon SES etc. A senha é guardada criptografada.
          Exemplos: Gmail <span className="mono">smtp.gmail.com</span> porta 587 (senha de app);
          Hostinger <span className="mono">smtp.hostinger.com</span> porta 465 (SSL).
        </p>
        {error && <div className="alert danger" style={{ marginBottom: 10 }}><span>{error}</span></div>}
        {msg && <div className="alert success" style={{ marginBottom: 10 }}><span>{msg}</span></div>}
        <div className="erp-form">
          <label className="check-row">
            <input type="checkbox" checked={cfg.ativo} onChange={(e) => setCfg({ ...cfg, ativo: e.target.checked })} />
            Ativar envio de e-mails
          </label>
          <label>Servidor SMTP
            <input value={cfg.host} onChange={(e) => setCfg({ ...cfg, host: e.target.value })} placeholder="Ex.: smtp.gmail.com" />
          </label>
          <label>Porta
            <input type="number" min={1} value={cfg.porta} onChange={(e) => setCfg({ ...cfg, porta: Number(e.target.value) || 587 })} />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={cfg.seguro} onChange={(e) => setCfg({ ...cfg, seguro: e.target.checked })} />
            Conexão SSL/TLS direta (porta 465). Desmarcado = STARTTLS (porta 587).
          </label>
          <label>Usuário (e-mail de login)
            <input value={cfg.usuario} onChange={(e) => setCfg({ ...cfg, usuario: e.target.value })} placeholder="Ex.: contato@suaempresa.com.br" />
          </label>
          <label>Senha{cfg.temSenha ? " (já salva)" : ""}
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder={cfg.temSenha ? "Manter senha atual" : "Senha ou senha de app"} />
          </label>
          <label>Nome do remetente
            <input value={cfg.remetenteNome} onChange={(e) => setCfg({ ...cfg, remetenteNome: e.target.value })} placeholder="Ex.: JR Brasil Autopeças" />
          </label>
          <label>E-mail do remetente (opcional)
            <input value={cfg.remetenteEmail} onChange={(e) => setCfg({ ...cfg, remetenteEmail: e.target.value })} placeholder="Padrão: o usuário de login" />
          </label>
        </div>
        <div className="erp-toolbar" style={{ borderBottom: "none", paddingBottom: 0, marginTop: 8 }}>
          <div className="grow" />
          <button type="button" className="btn-erp primary sm" disabled={busy} onClick={salvar}>{busy ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

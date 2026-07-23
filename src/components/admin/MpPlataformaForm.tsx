"use client";

import { useEffect, useState } from "react";

/**
 * Credenciais da APLICAÇÃO Mercado Pago da plataforma (OAuth marketplace): com elas salvas, cada
 * cliente conecta a própria conta MP em Configurações → Contas financeiras ("Conectar Mercado Pago").
 */
export function MpPlataformaForm({ redirectUri }: { redirectUri: string }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [temSecret, setTemSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/admin/pagamentos")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { clientId?: string | null; temSecret?: boolean } | null) => {
        if (d?.clientId) setClientId(d.clientId);
        setTemSecret(Boolean(d?.temSecret));
      })
      .catch(() => {});
  }, []);

  async function salvar() {
    setBusy(true);
    setErro("");
    setMsg("");
    try {
      const res = await fetch("/api/admin/pagamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret: clientSecret.trim() || null })
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(d.error || "Não foi possível salvar.");
      setMsg("Credenciais salvas — os clientes já podem conectar a conta Mercado Pago deles.");
      setClientSecret("");
      if (clientSecret.trim()) setTemSecret(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="erp-card">
      <div className="erp-card-head"><h3>Aplicação Mercado Pago (OAuth)</h3></div>
      <div className="erp-card-body">
        <p style={{ fontSize: 13, color: "var(--erp-slate)", marginTop: 0 }}>
          Crie a aplicação em <strong>mercadopago.com.br/developers</strong> (Suas integrações → Criar
          aplicação, modelo <em>marketplace</em>) e cole aqui o <strong>client_id</strong> e o{" "}
          <strong>client_secret</strong>. Na aplicação, cadastre esta URL de redirecionamento:
        </p>
        <p style={{ fontSize: 13 }}>
          <code style={{ background: "var(--erp-line)", padding: "4px 8px", borderRadius: 6 }}>{redirectUri}</code>
        </p>
        {erro && <div className="alert danger" style={{ marginBottom: 10 }}><span>{erro}</span></div>}
        {msg && <div className="alert success" style={{ marginBottom: 10 }}><span>{msg}</span></div>}
        <div className="erp-form" style={{ gridTemplateColumns: "1fr 1fr", padding: 0 }}>
          <label>client_id
            <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Ex.: 1234567890123456" />
          </label>
          <label>client_secret
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={temSecret ? "•••••• (mantém o atual se vazio)" : "Cole aqui (fica criptografado)"}
              autoComplete="off"
            />
          </label>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" className="btn-erp primary sm" onClick={salvar} disabled={busy || !clientId.trim()}>
            {busy ? "Salvando…" : "Salvar credenciais"}
          </button>
        </div>
      </div>
    </div>
  );
}

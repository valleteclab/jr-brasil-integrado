"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Segunda etapa (2FA): desafio pendente + código digitado.
  const [desafio, setDesafio] = useState<{ id: string; whatsapp: string } | null>(null);
  const [codigo, setCodigo] = useState("");

  async function onSubmit(e: React.FormEvent) {
    if (desafio) return confirmarCodigo(e); // etapa 2FA: submit confirma o código
    return entrar(e);
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; redirect?: string; twofa?: boolean; desafioId?: string; whatsappMascarado?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível entrar.");
      if (data.twofa && data.desafioId) {
        setDesafio({ id: data.desafioId, whatsapp: data.whatsappMascarado ?? "" });
        setCodigo("");
        return;
      }
      router.replace(data.redirect || "/erp");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmarCodigo(e: React.FormEvent) {
    e.preventDefault();
    if (!desafio) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desafioId: desafio.id, codigo })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; redirect?: string };
      if (!res.ok) throw new Error(data.error || "Código inválido.");
      router.replace(data.redirect || "/erp");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Código inválido.";
      setError(msg);
      // Desafio expirado/consumido: volta para a etapa de senha.
      if (/expirado|novamente/i.test(msg)) {
        setDesafio(null);
        setCodigo("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--erp-bg, #0f172a)", padding: 20 }}>
      <form
        onSubmit={onSubmit}
        style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 12, padding: 32, boxShadow: "0 10px 40px rgba(0,0,0,.25)" }}
      >
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/xerp-192.png"
            alt="XERP"
            width={64}
            height={64}
            style={{ borderRadius: 14, display: "block", margin: "0 auto 12px", boxShadow: "0 6px 18px rgba(11,18,32,.35)" }}
          />
          <h1 style={{ fontFamily: "Barlow Condensed, sans-serif", fontWeight: 800, fontSize: 28, margin: 0, letterSpacing: 1 }}>XERP</h1>
          <p style={{ color: "var(--erp-slate, #64748b)", fontSize: 13, margin: "4px 0 0" }}>Acesse sua conta</p>
        </div>

        {error && <div className="alert danger" style={{ marginBottom: 14 }}><span>{error}</span></div>}

        {desafio ? (
          <>
            <p style={{ fontSize: 13, color: "var(--erp-slate, #475569)", margin: "0 0 14px" }}>
              Enviamos um código de 6 dígitos para o WhatsApp <strong>{desafio.whatsapp}</strong>. Digite-o para concluir o acesso.
            </p>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Código de verificação</label>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              autoFocus
              style={{ width: "100%", height: 46, padding: "0 12px", border: "1px solid var(--erp-line, #e2e8f0)", borderRadius: 8, fontSize: 22, letterSpacing: 8, textAlign: "center", marginBottom: 18, boxSizing: "border-box" }}
            />
            <button type="submit" className="btn-erp primary" disabled={busy || codigo.length !== 6} style={{ width: "100%", height: 44 }}>
              {busy ? "Verificando…" : "Confirmar código"}
            </button>
            <button
              type="button"
              className="btn-erp ghost sm"
              style={{ width: "100%", marginTop: 10 }}
              onClick={() => { setDesafio(null); setCodigo(""); setError(""); }}
            >
              ← Voltar e entrar de novo
            </button>
          </>
        ) : (
        <>
        <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>E-mail</label>
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ width: "100%", height: 42, padding: "0 12px", border: "1px solid var(--erp-line, #e2e8f0)", borderRadius: 8, fontSize: 14, marginBottom: 14, boxSizing: "border-box" }}
        />

        <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Senha</label>
        <input
          type="password"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          required
          style={{ width: "100%", height: 42, padding: "0 12px", border: "1px solid var(--erp-line, #e2e8f0)", borderRadius: 8, fontSize: 14, marginBottom: 18, boxSizing: "border-box" }}
        />

        <button type="submit" className="btn-erp primary" disabled={busy} style={{ width: "100%", height: 44 }}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
        </>
        )}

        <p style={{ textAlign: "center", color: "var(--erp-slate, #94a3b8)", fontSize: 11.5, margin: "18px 0 0" }}>
          por <strong style={{ fontWeight: 700 }}>Valleteclab</strong>
        </p>
      </form>
    </div>
  );
}

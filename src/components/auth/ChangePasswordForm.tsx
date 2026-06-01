"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ChangePasswordForm() {
  const router = useRouter();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  async function trocar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (novaSenha.length < 8) { setError("A nova senha deve ter ao menos 8 caracteres."); return; }
    if (novaSenha !== confirma) { setError("A confirmação não corresponde à nova senha."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/trocar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senhaAtual, novaSenha })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível trocar a senha.");
      setOk(true);
      setSenhaAtual(""); setNovaSenha(""); setConfirma("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível trocar a senha.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={trocar} className="erp-card" style={{ maxWidth: 460 }}>
      <div className="erp-card-head"><h3>Trocar senha</h3></div>
      <div className="erp-card-body">
        <p style={{ fontSize: 12.5, color: "var(--erp-mute)", margin: "0 0 12px" }}>
          Por segurança, troque a senha temporária no primeiro acesso. As demais sessões
          (outros dispositivos) serão encerradas ao trocar.
        </p>
        {error && <div className="alert danger" style={{ marginBottom: 10 }}><span>{error}</span></div>}
        {ok && <div className="alert success" style={{ marginBottom: 10 }}><span>Senha alterada com sucesso.</span></div>}
        <div className="erp-form" style={{ gridTemplateColumns: "1fr" }}>
          <label>Senha atual
            <input type="password" autoComplete="current-password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} required />
          </label>
          <label>Nova senha (mín. 8 caracteres)
            <input type="password" autoComplete="new-password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} required />
          </label>
          <label>Confirmar nova senha
            <input type="password" autoComplete="new-password" value={confirma} onChange={(e) => setConfirma(e.target.value)} required />
          </label>
          <button type="submit" className="btn-erp primary" disabled={busy}>{busy ? "Salvando…" : "Trocar senha"}</button>
        </div>
      </div>
    </form>
  );
}

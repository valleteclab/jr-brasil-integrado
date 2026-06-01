"use client";

import { useState } from "react";

type Props = { usuarioId: string };

export function ResetarSenhaButton({ usuarioId }: Props) {
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<{ email: string; senhaInicial: string } | null>(null);

  async function resetar() {
    const ok = window.confirm("Gerar uma nova senha temporária para este usuário? A senha atual deixará de funcionar.");
    if (!ok) return;
    setBusy(true);
    setErro("");
    try {
      const res = await fetch(`/api/admin/usuarios/${usuarioId}/resetar-senha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const data = (await res.json().catch(() => ({}))) as { email?: string; senhaInicial?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível resetar a senha.");
      setResultado({ email: data.email ?? "", senhaInicial: data.senhaInicial ?? "" });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível resetar a senha.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      <button type="button" className="btn-erp ghost sm" onClick={resetar} disabled={busy}>
        {busy ? "Resetando…" : "Resetar senha"}
      </button>
      {erro && <span style={{ color: "var(--erp-danger)", fontSize: 11 }}>{erro}</span>}
      {resultado && (
        <div className="alert success" style={{ marginTop: 4 }}>
          <span>
            Nova senha de <b>{resultado.email}</b>: <code className="mark">{resultado.senhaInicial}</code>
            <br />Anote agora — não será exibida novamente.
          </span>
        </div>
      )}
    </div>
  );
}

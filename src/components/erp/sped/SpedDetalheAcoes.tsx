"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { arquivoId: string; enviado: boolean };

// Ações do arquivo na tela de apuração: baixar o .txt e marcar como enviado ao contador.
export function SpedDetalheAcoes({ arquivoId, enviado }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  async function marcarEnviado() {
    setBusy(true);
    setErro("");
    try {
      const res = await fetch(`/api/erp/sped-fiscal/${arquivoId}/enviado`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível marcar como enviado.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível marcar como enviado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <a className="button primary" href={`/api/erp/sped-fiscal/${arquivoId}/download`}>⬇ Baixar arquivo .txt</a>
      {!enviado && (
        <button type="button" className="button dark" onClick={marcarEnviado} disabled={busy}>
          {busy ? "Salvando…" : "Marcar como enviado ao contador"}
        </button>
      )}
      {erro && <span style={{ color: "var(--jr-danger)", fontSize: 12 }}>{erro}</span>}
    </div>
  );
}

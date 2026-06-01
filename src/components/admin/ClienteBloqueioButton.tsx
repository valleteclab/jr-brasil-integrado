"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { clienteId: string; clienteNome: string; ativo: boolean };

export function ClienteBloqueioButton({ clienteId, clienteNome, ativo }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  async function alternar() {
    if (ativo) {
      const ok = window.confirm(`Bloquear o cliente "${clienteNome}"? Os usuários dele perderão o acesso imediatamente.`);
      if (!ok) return;
    }
    const acao = ativo ? "bloquear" : "liberar";
    setBusy(true);
    setErro("");
    try {
      const res = await fetch(`/api/admin/clientes/${clienteId}/${acao}`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível concluir a ação.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível concluir a ação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
      {ativo ? (
        <button type="button" className="btn-erp danger" onClick={alternar} disabled={busy}>
          {busy ? "Bloqueando…" : "Bloquear cliente"}
        </button>
      ) : (
        <button type="button" className="btn-erp primary" onClick={alternar} disabled={busy}>
          {busy ? "Liberando…" : "Liberar cliente"}
        </button>
      )}
      {erro && <span style={{ color: "var(--erp-danger)", fontSize: 11 }}>{erro}</span>}
    </div>
  );
}

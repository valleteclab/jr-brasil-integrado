"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { clienteId: string; habilitada: boolean };

// Dono do SaaS libera/bloqueia o módulo Loja Virtual para o cliente.
export function LojaModuloToggle({ clienteId, habilitada }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  async function alternar() {
    setBusy(true);
    setErro("");
    try {
      const res = await fetch(`/api/admin/clientes/${clienteId}/loja`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ habilitada: !habilitada })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível atualizar o módulo Loja.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível atualizar o módulo Loja.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span className={`status-badge ${habilitada ? "success" : "mute"}`}>
        Loja virtual: {habilitada ? "Habilitada" : "Desabilitada"}
      </span>
      <button type="button" className={habilitada ? "btn-erp ghost sm" : "btn-erp primary sm"} onClick={alternar} disabled={busy}>
        {busy ? "Salvando…" : habilitada ? "Desabilitar loja" : "Habilitar loja"}
      </button>
      {erro && <span style={{ color: "var(--erp-danger)", fontSize: 11 }}>{erro}</span>}
    </div>
  );
}

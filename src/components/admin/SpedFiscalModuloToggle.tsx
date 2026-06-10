"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { clienteId: string; habilitado: boolean };

// Dono do SaaS libera/bloqueia o módulo SPED Fiscal (EFD ICMS/IPI) para o cliente.
export function SpedFiscalModuloToggle({ clienteId, habilitado }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  async function alternar() {
    setBusy(true);
    setErro("");
    try {
      const res = await fetch(`/api/admin/clientes/${clienteId}/sped-fiscal`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ habilitado: !habilitado })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível atualizar o módulo SPED Fiscal.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível atualizar o módulo SPED Fiscal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span className={`status-badge ${habilitado ? "success" : "mute"}`}>
        SPED Fiscal: {habilitado ? "Habilitado" : "Desabilitado"}
      </span>
      <button type="button" className={habilitado ? "btn-erp ghost sm" : "btn-erp primary sm"} onClick={alternar} disabled={busy}>
        {busy ? "Salvando…" : habilitado ? "Desabilitar SPED" : "Habilitar SPED"}
      </button>
      {erro && <span style={{ color: "var(--erp-danger)", fontSize: 11 }}>{erro}</span>}
    </div>
  );
}

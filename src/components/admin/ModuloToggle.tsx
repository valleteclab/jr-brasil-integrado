"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TenantFeatureKey } from "@/lib/auth/feature-flags";

type Props = {
  clienteId: string;
  flag: TenantFeatureKey;
  label: string;
  descricao: string;
  habilitado: boolean;
};

// Toggle genérico de módulo por tenant (dono do SaaS). Salva via rota genérica /modulo, passando
// a flag e o novo valor. Reutilizado para todas as flags novas (PDV, tipos de venda, etc.).
export function ModuloToggle({ clienteId, flag, label, descricao, habilitado }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  async function alternar() {
    setBusy(true);
    setErro("");
    try {
      const res = await fetch(`/api/admin/clientes/${clienteId}/modulo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flag, habilitado: !habilitado })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível atualizar o módulo.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível atualizar o módulo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid var(--erp-line)" }}>
      <div style={{ minWidth: 200, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className={`status-badge ${habilitado ? "success" : "mute"}`}>{habilitado ? "Ligado" : "Desligado"}</span>
          <strong style={{ fontSize: 13 }}>{label}</strong>
        </div>
        <p className="block-muted" style={{ margin: "2px 0 0", fontSize: 11 }}>{descricao}</p>
        {erro && <span style={{ color: "var(--erp-danger)", fontSize: 11 }}>{erro}</span>}
      </div>
      <button type="button" className={habilitado ? "btn-erp ghost sm" : "btn-erp primary sm"} onClick={alternar} disabled={busy}>
        {busy ? "Salvando…" : habilitado ? "Desligar" : "Ligar"}
      </button>
    </div>
  );
}

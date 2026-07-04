"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type EmpresaStatus = "ATIVA" | "INATIVA" | "BLOQUEADA";

type Props = { empresaId: string; status: string; exigir2fa?: boolean };

export function EmpresaStatusActions({ empresaId, status, exigir2fa = false }: Props) {
  const router = useRouter();
  const [valor, setValor] = useState<EmpresaStatus>((status as EmpresaStatus) ?? "ATIVA");
  const [dois, setDois] = useState(exigir2fa);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  async function alternar2fa(exigir: boolean) {
    setDois(exigir);
    setBusy(true);
    setErro("");
    try {
      const res = await fetch(`/api/admin/empresas/${empresaId}/dois-fatores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exigir })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível alterar o 2FA.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível alterar o 2FA.");
      setDois(!exigir);
    } finally {
      setBusy(false);
    }
  }

  async function alterar(novoStatus: EmpresaStatus) {
    setValor(novoStatus);
    setBusy(true);
    setErro("");
    try {
      const res = await fetch(`/api/admin/empresas/${empresaId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novoStatus })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível alterar o status.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível alterar o status.");
      setValor(status as EmpresaStatus);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      <select
        className="btn-erp ghost sm"
        value={valor}
        disabled={busy}
        onChange={(e) => alterar(e.target.value as EmpresaStatus)}
      >
        <option value="ATIVA">Ativa</option>
        <option value="INATIVA">Inativa</option>
        <option value="BLOQUEADA">Bloqueada</option>
      </select>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }} title="Exige código por WhatsApp no login dos usuários desta empresa">
        <input type="checkbox" checked={dois} disabled={busy} onChange={(e) => alternar2fa(e.target.checked)} />
        Exigir 2FA (WhatsApp)
      </label>
      {erro && <span style={{ color: "var(--erp-danger)", fontSize: 11 }}>{erro}</span>}
    </div>
  );
}

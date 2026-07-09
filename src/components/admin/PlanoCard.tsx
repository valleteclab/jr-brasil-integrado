"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Plano comercial do cliente + trial. Trocar o plano aplica o PRESET de módulos (Emissor liga só
 * o fiscal; Completo religa os de série) — os toggles individuais continuam valendo depois, para
 * ajustes finos. Trial vencido bloqueia o ERP do cliente com aviso (o dono estende/limpa aqui).
 */
export function PlanoCard({ clienteId, plano, trialFimEm }: { clienteId: string; plano: string; trialFimEm: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  async function post(body: { plano?: "COMPLETO" | "EMISSOR"; trialDias?: number | null }) {
    setBusy(true);
    setErro("");
    try {
      const res = await fetch(`/api/admin/clientes/${clienteId}/plano`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(d.error || "Falha ao atualizar o plano.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao atualizar o plano.");
    } finally {
      setBusy(false);
    }
  }

  function trocarPlano(novo: "COMPLETO" | "EMISSOR") {
    if (novo === plano) return;
    const msg = novo === "EMISSOR"
      ? "Colocar este cliente no plano EMISSOR DE NOTAS? Os módulos além da emissão fiscal serão desligados (o upgrade religa tudo)."
      : "Fazer UPGRADE deste cliente para o plano COMPLETO? Os módulos de série serão religados.";
    if (!window.confirm(msg)) return;
    void post({ plano: novo });
  }

  const trialAtivo = Boolean(trialFimEm);
  const trialVencido = trialAtivo && new Date(trialFimEm!) < new Date();
  const diasRestantes = trialAtivo ? Math.ceil((new Date(trialFimEm!).getTime() - Date.now()) / 86400000) : null;

  return (
    <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      {erro && <div className="alert danger">{erro}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className={`btn-erp ${plano === "COMPLETO" ? "primary" : "light"} sm`} disabled={busy} onClick={() => trocarPlano("COMPLETO")}>
          Completo (ERP inteiro)
        </button>
        <button type="button" className={`btn-erp ${plano === "EMISSOR" ? "primary" : "light"} sm`} disabled={busy} onClick={() => trocarPlano("EMISSOR")}>
          🧾 Emissor de Notas
        </button>
        <span className="block-muted" style={{ fontSize: 12 }}>
          Emissor = só NF-e/NFS-e + clientes/produtos (MEI e Simples). Mesmo sistema — upgrade religa IA, WhatsApp, PDV etc.
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <strong style={{ fontSize: 13 }}>Período de teste:</strong>
        {trialAtivo ? (
          <span className={`pill ${trialVencido ? "danger" : "warn"}`}>
            <span className="dot" />
            {trialVencido ? `Vencido em ${new Date(trialFimEm!).toLocaleDateString("pt-BR")}` : `${diasRestantes} dia(s) restante(s) — até ${new Date(trialFimEm!).toLocaleDateString("pt-BR")}`}
          </span>
        ) : (
          <span className="pill success"><span className="dot" />Sem trial (liberado)</span>
        )}
        <button type="button" className="btn-erp light xs" disabled={busy} onClick={() => post({ trialDias: 7 })}>Iniciar/renovar 7 dias</button>
        {trialAtivo && (
          <button type="button" className="btn-erp ghost xs" disabled={busy} onClick={() => post({ trialDias: null })} title="Remove o prazo — cliente vira assinante liberado">
            ✓ Virar assinante (remover trial)
          </button>
        )}
      </div>
      <p className="block-muted" style={{ margin: 0, fontSize: 12 }}>
        Trial vencido bloqueia o ERP do cliente com um aviso para falar com o suporte — os dados ficam intactos.
      </p>
    </div>
  );
}

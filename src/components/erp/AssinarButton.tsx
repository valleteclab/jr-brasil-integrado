"use client";

import { useState } from "react";

/**
 * Botão "Assinar agora" da tela de trial vencido: cria a assinatura (Asaas) do plano do tenant e
 * abre a fatura para pagamento. Confirmado o pagamento, o webhook libera o acesso sozinho.
 */
export function AssinarButton({ precoMensal }: { precoMensal: number | null }) {
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [aguardando, setAguardando] = useState(false);

  async function assinar() {
    setBusy(true);
    setErro("");
    try {
      const res = await fetch("/api/erp/assinatura", { method: "POST" });
      const d = (await res.json().catch(() => ({}))) as { invoiceUrl?: string | null; error?: string };
      if (!res.ok) throw new Error(d.error || "Não foi possível iniciar a assinatura.");
      if (d.invoiceUrl) window.open(d.invoiceUrl, "_blank", "noopener,noreferrer");
      setAguardando(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível iniciar a assinatura.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      {erro && <div style={{ background: "#fef2f2", color: "#b91c1c", borderRadius: 8, padding: "8px 10px", fontSize: 13, marginBottom: 8 }}>{erro}</div>}
      {aguardando ? (
        <p style={{ fontSize: 13, color: "#166534", background: "#f0fdf4", borderRadius: 8, padding: "10px 12px" }}>
          Fatura aberta em outra aba. Assim que o pagamento for confirmado, seu acesso é liberado
          automaticamente — recarregue esta página.
        </p>
      ) : (
        <button
          type="button"
          onClick={assinar}
          disabled={busy}
          style={{ background: "#2563eb", color: "#fff", border: "none", padding: "12px 26px", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: "pointer" }}
        >
          {busy ? "Gerando fatura…" : `💳 Assinar agora${precoMensal ? ` — ${precoMensal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês` : ""}`}
        </button>
      )}
    </div>
  );
}

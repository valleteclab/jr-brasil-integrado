"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  id: string;
  numero: string;
  canAprovar: boolean;
  canConverter: boolean;
  canRejeitar: boolean;
};

export function QuoteDetailActions({ id, numero, canAprovar, canConverter, canRejeitar }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function call(action: "aprovar" | "rejeitar" | "converter", confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(action);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/erp/orcamentos/${id}/${action}`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string; numeroPedido?: string };
      if (!res.ok) throw new Error(data.error || `Falha ao ${action}.`);
      setMessage(action === "converter" ? `Pedido ${data.numeroPedido ?? ""} criado.` : "Ação concluída.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir a ação.");
    } finally {
      setBusy("");
    }
  }

  const semAcoes = !canAprovar && !canConverter && !canRejeitar;

  return (
    <section className="erp-card">
      <div className="erp-card-head"><div><h3>Ações</h3></div></div>
      <div className="detalhe-acoes">
        {canAprovar && <button type="button" className="btn-erp primary sm" onClick={() => call("aprovar")} disabled={!!busy}>{busy === "aprovar" ? "Aprovando…" : "Aprovar"}</button>}
        {canConverter && <button type="button" className="btn-erp primary sm" onClick={() => call("converter", `Converter o orçamento ${numero} em pedido de venda?`)} disabled={!!busy}>{busy === "converter" ? "Convertendo…" : "Converter em pedido"}</button>}
        {canRejeitar && <button type="button" className="btn-erp danger sm" onClick={() => call("rejeitar", `Rejeitar o orçamento ${numero}?`)} disabled={!!busy}>{busy === "rejeitar" ? "Rejeitando…" : "Rejeitar"}</button>}
        {semAcoes && <span className="block-muted">Nenhuma ação disponível para a situação atual.</span>}
      </div>
      {message && <div className="alert info" style={{ margin: "0 16px 12px" }}><span>{message}</span></div>}
      {error && <div className="alert danger" style={{ margin: "0 16px 12px" }}><span>{error}</span></div>}
    </section>
  );
}

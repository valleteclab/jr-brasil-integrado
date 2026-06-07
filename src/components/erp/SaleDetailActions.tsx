"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EspelhoFiscalModal, type FiscalPreview } from "./EspelhoFiscal";

type Props = {
  id: string;
  numero: string;
  canConfirm: boolean;
  canInvoice: boolean;
  canCancel: boolean;
  temNotaAutorizada: boolean;
};

export function SaleDetailActions({ id, numero, canConfirm, canInvoice, canCancel, temNotaAutorizada }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<FiscalPreview | null>(null);

  async function espelho(modelo: "NFE" | "NFCE") {
    setBusy("espelho");
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/erp/vendas/${id}/preview-nota`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelo })
      });
      const data = (await res.json().catch(() => ({}))) as FiscalPreview & { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível calcular o espelho fiscal.");
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível calcular o espelho fiscal.");
    } finally {
      setBusy("");
    }
  }

  async function executar(label: string, url: string, body?: unknown) {
    setBusy(label);
    setError("");
    setMessage("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível concluir a ação.");
      setMessage("Ação concluída.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir a ação.");
    } finally {
      setBusy("");
    }
  }

  function confirmar() {
    if (!window.confirm(`Confirmar o pedido ${numero}? Isso efetiva a saída de estoque e cria conta a receber.`)) return;
    executar("confirmar", `/api/erp/vendas/${id}/confirmar`);
  }
  function faturar(modelo: "NFE" | "NFCE") {
    if (!window.confirm(`Emitir ${modelo === "NFE" ? "NF-e" : "NFC-e"} para o pedido ${numero}?`)) return;
    executar("faturar", `/api/erp/vendas/${id}/faturar`, { modelo });
  }
  function cancelar() {
    if (temNotaAutorizada) {
      window.alert("Não é possível cancelar: há nota fiscal autorizada vinculada. Cancele a nota antes.");
      return;
    }
    if (!window.confirm(`Cancelar o pedido ${numero}? Esta ação não pode ser desfeita.`)) return;
    executar("cancelar", `/api/erp/vendas/${id}/cancelar`);
  }

  const semAcoes = !canConfirm && !canInvoice && !canCancel;

  return (
    <section className="erp-card">
      <div className="erp-card-head"><div><h3>Ações</h3></div></div>
      <div className="detalhe-acoes">
        {canConfirm && <button type="button" className="btn-erp primary sm" onClick={confirmar} disabled={!!busy}>{busy === "confirmar" ? "Confirmando…" : "Confirmar pedido"}</button>}
        {canInvoice && <button type="button" className="btn-erp primary sm" onClick={() => faturar("NFE")} disabled={!!busy}>{busy === "faturar" ? "Emitindo…" : "Emitir NF-e"}</button>}
        {canInvoice && <button type="button" className="btn-erp ghost sm" onClick={() => faturar("NFCE")} disabled={!!busy}>Emitir NFC-e</button>}
        <button type="button" className="btn-erp light sm" onClick={() => espelho("NFE")} disabled={!!busy}>{busy === "espelho" ? "Calculando…" : "🔍 Espelho fiscal"}</button>
        {canCancel && <button type="button" className="btn-erp danger sm" onClick={cancelar} disabled={!!busy}>{busy === "cancelar" ? "Cancelando…" : "Cancelar pedido"}</button>}
        {semAcoes && <span className="block-muted">Use o espelho fiscal para conferir os impostos. Nenhuma outra ação disponível para a situação atual.</span>}
      </div>
      {message && <div className="alert info" style={{ margin: "0 16px 12px" }}><span>{message}</span></div>}
      {error && <div className="alert danger" style={{ margin: "0 16px 12px" }}><span>{error}</span></div>}
      {preview && <EspelhoFiscalModal preview={preview} onClose={() => setPreview(null)} title={`Espelho fiscal — pedido ${numero}`} />}
    </section>
  );
}

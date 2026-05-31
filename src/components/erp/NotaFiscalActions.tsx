"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  id: string;
  modeloLabel: string;
  numero: string;
  canCancel: boolean;
  canCorrect: boolean;
  canDownload: boolean;
  canSync: boolean;
};

export function NotaFiscalActions({ id, modeloLabel, numero, canCancel, canCorrect, canDownload, canSync }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function sincronizar() {
    setBusy("sync"); setError(""); setInfo("");
    try {
      const res = await fetch(`/api/erp/fiscal/${id}/sincronizar`, { method: "POST" });
      const data = (await res.json()) as { status?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível sincronizar.");
      setInfo(`Status atualizado: ${data.status}.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível sincronizar.");
    } finally {
      setBusy(null);
    }
  }

  async function cancelar() {
    const justificativa = window.prompt(`Justificativa do cancelamento da ${modeloLabel} ${numero} (mínimo 15 caracteres):`);
    if (justificativa === null) return;
    setBusy("cancel"); setError(""); setInfo("");
    try {
      const res = await fetch(`/api/erp/fiscal/${id}/cancelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ justificativa })
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível cancelar a nota.");
      setInfo("Nota cancelada com sucesso.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível cancelar a nota.");
    } finally {
      setBusy(null);
    }
  }

  async function corrigir() {
    const correcao = window.prompt(`Texto da carta de correção da ${modeloLabel} ${numero} (mínimo 15 caracteres):`);
    if (correcao === null) return;
    setBusy("correct"); setError(""); setInfo("");
    try {
      const res = await fetch(`/api/erp/fiscal/${id}/carta-correcao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correcao })
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível registrar a carta de correção.");
      setInfo("Carta de correção registrada com sucesso.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível registrar a carta de correção.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="erp-card">
      <div className="erp-card-head"><h3>Ações</h3></div>
      <div className="erp-card-body" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {canDownload && (
          <>
            <a className="btn-erp primary sm" href={`/api/erp/fiscal/${id}/pdf`} target="_blank" rel="noopener noreferrer">Baixar PDF</a>
            <a className="btn-erp light sm" href={`/api/erp/fiscal/${id}/xml`}>Baixar XML</a>
          </>
        )}
        {canSync && (
          <button type="button" className="btn-erp ghost sm" onClick={sincronizar} disabled={busy !== null}>
            {busy === "sync" ? "Atualizando…" : "Atualizar status"}
          </button>
        )}
        {canCorrect && (
          <button type="button" className="btn-erp ghost sm" onClick={corrigir} disabled={busy !== null}>
            {busy === "correct" ? "Enviando…" : "Carta de correção"}
          </button>
        )}
        {canCancel && (
          <button type="button" className="danger-link" onClick={cancelar} disabled={busy !== null}>
            {busy === "cancel" ? "Cancelando…" : "Cancelar nota"}
          </button>
        )}
      </div>
      {error && <div className="alert danger" style={{ margin: "0 16px 16px" }}><span>{error}</span></div>}
      {info && <div className="alert success" style={{ margin: "0 16px 16px" }}><span>{info}</span></div>}
    </div>
  );
}

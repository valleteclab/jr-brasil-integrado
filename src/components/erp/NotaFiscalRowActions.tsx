"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { EnviarDocumentoModal } from "./EnviarDocumentoModal";

export type NotaAcoes = {
  id: string;
  numero: string | null;
  modeloLabel: string;
  chaveAcesso: string;
  canDownload: boolean;
  canClone: boolean;
  canDevolver: boolean;
  canCorrect: boolean;
  canCancel: boolean;
};

/**
 * Ações fiscais de uma nota (Ver, PDF, XML, Clonar, Devolução, Carta de correção, Cancelar),
 * reaproveitadas direto na tela da venda — mesmas rotas da tela de Notas Emitidas.
 */
export function NotaFiscalRowActions({ nota }: { nota: NotaAcoes }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function cancelar() {
    const justificativa = window.prompt(
      `Justificativa do cancelamento da ${nota.modeloLabel} ${nota.numero ?? ""} (mínimo 15 caracteres):`
    );
    if (justificativa === null) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/erp/fiscal/${nota.id}/cancelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ justificativa })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível cancelar a nota.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível cancelar a nota.");
    } finally {
      setBusy(false);
    }
  }

  async function corrigir() {
    const correcao = window.prompt(
      `Texto da carta de correção da ${nota.modeloLabel} ${nota.numero ?? ""} (mínimo 15 caracteres):`
    );
    if (correcao === null) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/erp/fiscal/${nota.id}/carta-correcao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correcao })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível registrar a carta de correção.");
      window.alert("Carta de correção registrada com sucesso.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível registrar a carta de correção.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="nota-acoes" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      <Link className="btn-erp ghost xs" href={`/erp/fiscal/${nota.id}`}>Ver</Link>
      {nota.canDownload && (
        <>
          <a className="btn-erp ghost xs" href={`/api/erp/fiscal/${nota.id}/pdf`} target="_blank" rel="noopener noreferrer">PDF</a>
          <a className="btn-erp ghost xs" href={`/api/erp/fiscal/${nota.id}/xml`}>XML</a>
          <button
            type="button"
            className="btn-erp ghost xs"
            title="Enviar a nota (PDF + XML) ao cliente por e-mail/WhatsApp"
            onClick={() => setEnviando(true)}
          >
            📤 Enviar
          </button>
        </>
      )}
      {nota.canClone && <Link className="btn-erp ghost xs" href={`/erp/fiscal/emitir?clonar=${nota.id}`}>Clonar</Link>}
      {nota.canDevolver && <Link className="btn-erp ghost xs" href={`/erp/fiscal/emitir?devolucao=${nota.id}`}>Devolução</Link>}
      {nota.canCorrect && (
        <button className="btn-erp ghost xs" type="button" disabled={busy} onClick={corrigir}>Carta de correção</button>
      )}
      {nota.canCancel && (
        <button className="danger-link" type="button" disabled={busy} onClick={cancelar}>
          {busy ? "Processando…" : "Cancelar"}
        </button>
      )}
      {error && <span className="alert danger" style={{ width: "100%", marginTop: 4 }}>{error}</span>}
      {enviando && (
        <EnviarDocumentoModal
          titulo={`Enviar ${nota.modeloLabel} ${nota.numero ?? ""}`}
          descricao="O PDF (e o XML, quando disponível) vai anexado no e-mail; no WhatsApp o PDF segue como documento."
          endpoint={`/api/erp/fiscal/${nota.id}/enviar`}
          onClose={() => setEnviando(false)}
        />
      )}
    </div>
  );
}

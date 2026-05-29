"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/shared/Button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { NotaFiscalSummary } from "@/lib/services/fiscal";

type Props = {
  notas: NotaFiscalSummary[];
};

export function NotasFiscaisList({ notas }: Props) {
  const [rows, setRows] = useState(notas);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((n) =>
      [n.numero, n.serie, n.destinatario, n.destinatarioDocumento, n.chaveAcesso, n.modeloLabel, n.statusLabel]
        .some((f) => f.toLowerCase().includes(q))
    );
  }, [query, rows]);

  async function cancel(nota: NotaFiscalSummary) {
    const justificativa = window.prompt(
      `Justificativa do cancelamento da ${nota.modeloLabel} ${nota.numero} (mínimo 15 caracteres):`
    );
    if (justificativa === null) return;

    setBusyId(nota.id);
    setError("");
    try {
      const response = await fetch(`/api/erp/fiscal/${nota.id}/cancelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ justificativa })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível cancelar a nota.");
      setRows((current) =>
        current.map((row) =>
          row.id === nota.id
            ? { ...row, status: "CANCELADA", statusLabel: "Cancelada", statusTone: "danger", canCancel: false, canCorrect: false }
            : row
        )
      );
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Não foi possível cancelar a nota.");
    } finally {
      setBusyId(null);
    }
  }

  async function correct(nota: NotaFiscalSummary) {
    const correcao = window.prompt(`Texto da carta de correção da ${nota.modeloLabel} ${nota.numero} (mínimo 15 caracteres):`);
    if (correcao === null) return;

    setBusyId(nota.id);
    setError("");
    try {
      const response = await fetch(`/api/erp/fiscal/${nota.id}/carta-correcao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correcao })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível registrar a carta de correção.");
      window.alert("Carta de correção registrada com sucesso.");
    } catch (correctError) {
      setError(correctError instanceof Error ? correctError.message : "Não foi possível registrar a carta de correção.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="op-list">
      <div className="op-toolbar">
        <div className="op-search">
          <span aria-hidden="true">⌕</span>
          <input
            placeholder="Buscar por número, destinatário, chave de acesso..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="toolbar-grow" />
        <Button href="/erp/vendas" variant="light">Emitir por venda</Button>
        <Button href="/erp/os" variant="light">Emitir por OS</Button>
      </div>

      {error && <div className="alert danger"><strong>Atenção</strong><span>{error}</span></div>}

      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Documento</th>
              <th>Destinatário</th>
              <th>Chave de acesso</th>
              <th>Situação</th>
              <th>Ambiente</th>
              <th className="num">Valor</th>
              <th className="actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((nota) => (
              <tr key={nota.id}>
                <td>
                  <span className="mono bold">{nota.modeloLabel} {nota.numero}</span>
                  <small className="block-muted">Série {nota.serie} · {nota.emitidaEm}</small>
                </td>
                <td>
                  <strong>{nota.destinatario}</strong>
                  {nota.destinatarioDocumento && <small className="block-muted">{nota.destinatarioDocumento}</small>}
                </td>
                <td><span className="mono">{nota.chaveAcesso || "-"}</span></td>
                <td><StatusBadge tone={nota.statusTone}>{nota.statusLabel}</StatusBadge></td>
                <td>{nota.ambiente}</td>
                <td className="num">{nota.total}</td>
                <td className="actions">
                  {nota.canCorrect && (
                    <button className="link-btn" type="button" disabled={busyId === nota.id} onClick={() => correct(nota)}>
                      Carta de correção
                    </button>
                  )}
                  {nota.canCancel && (
                    <button className="danger-link" type="button" disabled={busyId === nota.id} onClick={() => cancel(nota)}>
                      {busyId === nota.id ? "Processando..." : "Cancelar"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-st">Nenhum documento fiscal emitido ainda. Emita pela tela de Vendas ou Ordens de Serviço.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

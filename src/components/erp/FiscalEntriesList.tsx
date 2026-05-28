"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/shared/Button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { FiscalEntrySummary } from "@/lib/services/fiscal-entries";

type FiscalEntriesListProps = {
  entries: FiscalEntrySummary[];
};

type Tab = "compra" | "recebidas";

export function FiscalEntriesList({ entries }: FiscalEntriesListProps) {
  const [rows, setRows] = useState(entries);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("compra");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [reversingId, setReversingId] = useState<string | null>(null);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return rows.filter((entry) => {
      if (!normalizedQuery) {
        return true;
      }

      return [
        entry.number,
        entry.series,
        entry.supplier,
        entry.supplierDocument,
        entry.status,
        entry.vinculation
      ].some((field) => field.toLowerCase().includes(normalizedQuery));
    });
  }, [query, rows]);

  const registeredCount = rows.filter((entry) => entry.status === "Registrada").length;
  const filteredIds = filteredEntries.map((entry) => entry.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));

  function toggleAllFiltered() {
    if (allFilteredSelected) {
      setSelectedIds((current) => current.filter((id) => !filteredIds.includes(id)));
      return;
    }

    setSelectedIds((current) => Array.from(new Set([...current, ...filteredIds])));
  }

  function toggleEntry(id: string) {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((selectedId) => selectedId !== id)
      : [...current, id]);
  }

  async function deleteEntries(ids: string[]) {
    if (!ids.length) {
      return;
    }

    const confirmed = window.confirm(ids.length === 1 ? "Excluir esta nota fiscal de entrada?" : `Excluir ${ids.length} notas fiscais de entrada?`);

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError("");

    try {
      for (const id of ids) {
        const entry = rows.find((row) => row.id === id);

        if (entry && !entry.canDelete) {
          throw new Error(`A NF-e ${entry.number} não pode ser excluída. Use estorno quando a nota já movimentou estoque.`);
        }

        const response = await fetch(`/api/erp/entradas-fiscais/${id}`, { method: "DELETE" });
        const data = await response.json() as { error?: string };

        if (!response.ok) {
          throw new Error(data.error || "Não foi possível excluir a nota fiscal de entrada.");
        }
      }

      setRows((current) => current.filter((entry) => !ids.includes(entry.id)));
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Não foi possível excluir a nota fiscal de entrada.");
    } finally {
      setDeleting(false);
    }
  }

  async function reverseEntry(entry: FiscalEntrySummary) {
    const motivo = window.prompt(`Informe o motivo do estorno da NF-e ${entry.number}:`);

    if (motivo === null) {
      return;
    }

    setReversingId(entry.id);
    setError("");

    try {
      const response = await fetch(`/api/erp/entradas-fiscais/${entry.id}/estornar`, {
        body: JSON.stringify({ motivo }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const data = await response.json() as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível estornar a nota fiscal de entrada.");
      }

      setRows((current) => current.map((row) => row.id === entry.id
        ? {
            ...row,
            canDelete: false,
            canReverse: false,
            rawStatus: "ESTORNADA",
            status: "Estornada",
            statusTone: "danger"
          }
        : row));
      setSelectedIds((current) => current.filter((id) => id !== entry.id));
    } catch (reverseError) {
      setError(reverseError instanceof Error ? reverseError.message : "Não foi possível estornar a nota fiscal de entrada.");
    } finally {
      setReversingId(null);
    }
  }

  return (
    <section className="fiscal-list-page">
      <div className="fiscal-list-actions">
        <div className="fiscal-list-search">
          <span aria-hidden="true">⌕</span>
          <input
            placeholder="Pesquisar por nome, CNPJ ou nº da nota"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <span className="fiscal-list-filter">Todas as lojas</span>
        <span className="fiscal-list-filter">Registradas: {registeredCount}</span>
        {selectedIds.length > 0 && <span className="fiscal-list-filter">{selectedIds.length} selecionada(s)</span>}
        <div className="toolbar-grow" />
        <Button variant="light" type="button">Exportar</Button>
        <Button
          variant="light"
          type="button"
          disabled={deleting || !selectedIds.length}
          onClick={() => deleteEntries(selectedIds)}
        >
          Excluir selecionadas
        </Button>
        <Button href="/erp/entradas-fiscais/nova">Nova entrada NF-e</Button>
      </div>

      {error && <div className="alert danger fiscal-list-alert"><strong>Atenção</strong><span>{error}</span></div>}

      <div className="fiscal-list-tabs">
        <button className={tab === "compra" ? "active" : ""} type="button" onClick={() => setTab("compra")}>
          Notas de compra
        </button>
        <button className={tab === "recebidas" ? "active" : ""} type="button" onClick={() => setTab("recebidas")}>
          Notas recebidas
        </button>
      </div>

      <div className="erp-table-wrap fiscal-list-table">
        <table className="erp-table">
          <thead>
            <tr>
              <th className="check">
                <input
                  aria-label="Selecionar todas"
                  checked={allFilteredSelected}
                  type="checkbox"
                  onChange={toggleAllFiltered}
                />
              </th>
              <th>Número</th>
              <th>Data entrada</th>
              <th>Fornecedor</th>
              <th>Situação</th>
              <th className="num">Valor</th>
              <th>Vinculação</th>
              <th className="actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((entry) => (
              <tr key={entry.id}>
                <td className="check">
                  <input
                    aria-label={`Selecionar nota ${entry.number}`}
                    checked={selectedIds.includes(entry.id)}
                    type="checkbox"
                    onChange={() => toggleEntry(entry.id)}
                  />
                </td>
                <td>
                  <span className="mono bold">{entry.number}</span>
                  {entry.series && <small className="block-muted">Série {entry.series}</small>}
                </td>
                <td>{entry.receivedAt || "-"}</td>
                <td>
                  <strong>{entry.supplier}</strong>
                  {entry.supplierDocument && <small className="block-muted">{entry.supplierDocument}</small>}
                </td>
                <td><StatusBadge tone={entry.statusTone}>{entry.status}</StatusBadge></td>
                <td className="num">{entry.total}</td>
                <td>
                  <StatusBadge tone={entry.vinculationTone}>{entry.vinculation}</StatusBadge>
                  <small className="block-muted">{entry.linkedItems}/{entry.totalItems} itens vinculados</small>
                </td>
                <td className="actions">
                  <Button href={`/erp/entradas-fiscais/nova?id=${entry.id}`} variant="light">Abrir</Button>
                  {entry.canReverse && (
                    <button className="danger-link" type="button" disabled={reversingId === entry.id} onClick={() => reverseEntry(entry)}>
                      {reversingId === entry.id ? "Estornando..." : "Estornar"}
                    </button>
                  )}
                  {entry.canDelete && (
                    <button className="danger-link" type="button" disabled={deleting} onClick={() => deleteEntries([entry.id])}>
                      Excluir
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!filteredEntries.length && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-st">Nenhuma nota fiscal de entrada encontrada.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="erp-table-foot">
          <span>{filteredEntries.length} notas exibidas</span>
          <strong>Total: {new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(filteredEntries.reduce((total, entry) => total + entry.totalNumber, 0))}</strong>
        </div>
      </div>
    </section>
  );
}

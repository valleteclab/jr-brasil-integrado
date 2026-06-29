"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/shared/Button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { FiscalEntrySummary } from "@/lib/services/fiscal-entries";
import type { NfeDistributionSummary } from "@/lib/services/nfe-distribution";

type FiscalEntriesListProps = {
  entries: FiscalEntrySummary[];
  receivedDocuments: NfeDistributionSummary[];
  ultimaSync?: string | null;
};

type Tab = "compra" | "recebidas";

// Etapas da importação (Ciência → XML → lançamento). O backend é uma única
// chamada síncrona à SEFAZ via ACBr; aqui só damos feedback de progresso para o
// usuário entender que o sistema está trabalhando (e não travado).
const IMPORT_STEPS = [
  "Enviando Ciência da Operação à SEFAZ…",
  "Baixando o XML completo da NF-e…",
  "Lançando a nota para conferência…",
  "Abrindo a tela de lançamento…"
];

export function FiscalEntriesList({ entries, receivedDocuments, ultimaSync }: FiscalEntriesListProps) {
  const [rows, setRows] = useState(entries);
  const [syncEm, setSyncEm] = useState<string | null>(ultimaSync ?? null);
  const [receivedRows, setReceivedRows] = useState(receivedDocuments);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("compra");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importLabel, setImportLabel] = useState("");
  const [importStep, setImportStep] = useState(0);
  const [navigating, setNavigating] = useState(false);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (stepTimer.current) clearInterval(stepTimer.current);
    };
  }, []);

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

  const filteredReceived = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return receivedRows.filter((doc) => {
      if (!normalizedQuery) {
        return true;
      }

      return [
        doc.numero,
        doc.serie,
        doc.chaveAcesso,
        doc.emitenteNome,
        doc.emitenteDocumento,
        doc.nsu,
        doc.statusLabel
      ].some((field) => field.toLowerCase().includes(normalizedQuery));
    });
  }, [query, receivedRows]);

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
      let produtosRemovidos = 0;
      for (const id of ids) {
        const entry = rows.find((row) => row.id === id);

        if (entry && !entry.canDelete) {
          throw new Error(`A NF-e ${entry.number} não pode ser excluída. Use estorno quando a nota já movimentou estoque.`);
        }

        const response = await fetch(`/api/erp/entradas-fiscais/${id}`, { method: "DELETE" });
        const data = await response.json() as { error?: string; produtosRemovidos?: number };

        if (!response.ok) {
          throw new Error(data.error || "Não foi possível excluir a nota fiscal de entrada.");
        }
        produtosRemovidos += data.produtosRemovidos ?? 0;
      }

      setRows((current) => current.filter((entry) => !ids.includes(entry.id)));
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
      if (produtosRemovidos > 0) {
        window.alert(`Exclusão concluída. ${produtosRemovidos} produto(s) criado(s) por essa(s) nota(s) — sem uso em outras notas/pedidos — também foram removidos.`);
      }
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

  async function syncDistribution(mode: "refresh" | "history" = "refresh") {
    setSyncing(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/erp/entradas-fiscais/distribuicao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode })
      });
      const data = await response.json() as {
        documents?: NfeDistributionSummary[];
        returned?: number;
        listed?: number;
        motivoStatus?: string | null;
        ultimoNsu?: string | null;
        maxNsu?: string | null;
        ultimaSync?: string | null;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível buscar as NF-e recebidas na SEFAZ.");
      }

      setReceivedRows(data.documents ?? []);
      if (data.ultimaSync) setSyncEm(data.ultimaSync);
      const nsuInfo = data.ultimoNsu ? ` Último NSU: ${data.ultimoNsu}${data.maxNsu ? ` / Máx: ${data.maxNsu}` : ""}.` : "";
      setMessage(
        data.motivoStatus
          ? `ACBr: ${data.motivoStatus}.${nsuInfo}`
          : mode === "history"
            ? `Busca historica solicitada. ${data.returned ?? 0} documento(s) retornados e ${data.listed ?? 0} documento(s) listados.${nsuInfo}`
            : `Base da ACBr sincronizada. ${data.listed ?? 0} documento(s) listados.${nsuInfo}`
      );
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Não foi possível buscar NF-e recebidas na ACBr.");
    } finally {
      setSyncing(false);
    }
  }

  function startImportSteps() {
    setImportStep(0);
    if (stepTimer.current) clearInterval(stepTimer.current);
    // Avança as etapas no tempo enquanto o backend conversa com a SEFAZ. Para na
    // penúltima etapa ("lançando…") — a última ("abrindo…") é setada no sucesso.
    stepTimer.current = setInterval(() => {
      setImportStep((current) => (current < IMPORT_STEPS.length - 2 ? current + 1 : current));
    }, 2500);
  }

  function stopImportSteps() {
    if (stepTimer.current) {
      clearInterval(stepTimer.current);
      stepTimer.current = null;
    }
  }

  async function importReceived(doc: NfeDistributionSummary) {
    const confirmed = window.confirm(
      `Enviar Ciência da Operação e importar o XML da NF-e ${doc.numero || doc.chaveAcesso}?\n\n` +
      "Isso não movimenta estoque agora. A nota irá para conferência antes do lançamento."
    );
    if (!confirmed) return;

    setImportingId(doc.id);
    setImportLabel(doc.numero ? `NF-e ${doc.numero}` : doc.chaveAcesso || "NF-e recebida");
    setError("");
    setMessage("");
    startImportSteps();

    try {
      const response = await fetch(`/api/erp/entradas-fiscais/distribuicao/${doc.id}/importar`, { method: "POST" });
      const data = await response.json() as { entradaFiscalId?: string; error?: string };

      if (!response.ok || !data.entradaFiscalId) {
        throw new Error(data.error || "Não foi possível importar a NF-e recebida.");
      }

      // Sucesso: trava a última etapa e mantém o overlay até a nova tela carregar.
      stopImportSteps();
      setImportStep(IMPORT_STEPS.length - 1);
      setNavigating(true);
      window.location.href = `/erp/entradas-fiscais/nova?id=${data.entradaFiscalId}`;
    } catch (importError) {
      stopImportSteps();
      setImportingId(null);
      setImportLabel("");
      setError(importError instanceof Error ? importError.message : "Não foi possível importar a NF-e recebida.");
      const refresh = await fetch("/api/erp/entradas-fiscais/distribuicao")
        .then((r) => r.json())
        .catch(() => null) as { documents?: NfeDistributionSummary[] } | null;
      if (refresh?.documents) setReceivedRows(refresh.documents);
    }
  }

  const busy = Boolean(importingId) || syncing || navigating;

  return (
    <section className="fiscal-list-page" aria-busy={busy}>
      {busy && (
        <div className="fiscal-busy" role="alertdialog" aria-live="assertive" aria-label="Processando">
          <div className="fiscal-busy-card">
            <div className="fiscal-spinner" aria-hidden="true" />
            {importingId ? (
              <>
                <strong>Importando {importLabel}</strong>
                <ol className="fiscal-busy-steps">
                  {IMPORT_STEPS.map((label, idx) => (
                    <li key={label} className={idx < importStep ? "done" : idx === importStep ? "active" : "pending"}>
                      {label}
                    </li>
                  ))}
                </ol>
                <small>Pode levar alguns segundos — depende da resposta da SEFAZ. Não feche esta janela.</small>
              </>
            ) : (
              <>
                <strong>Sincronizando com a ACBr / SEFAZ…</strong>
                <small>Buscando as NF-e emitidas contra o seu CNPJ. Pode levar alguns segundos.</small>
              </>
            )}
          </div>
        </div>
      )}
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
        {tab === "recebidas" ? (
          <>
            <span className="fiscal-list-filter" title="A sincronização roda automaticamente a cada hora; use o botão para atualizar agora.">
              {syncEm
                ? `Atualizado em ${new Date(syncEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
                : "Sincronização automática ativa"}
            </span>
            <Button type="button" onClick={() => syncDistribution("refresh")} disabled={syncing}>
              {syncing ? "Atualizando..." : "Atualizar agora"}
            </Button>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      {message && <div className="alert info fiscal-list-alert"><strong>OK</strong><span>{message}</span></div>}
      {error && <div className="alert danger fiscal-list-alert"><strong>Atenção</strong><span>{error}</span></div>}

      <div className="fiscal-list-tabs">
        <button className={tab === "compra" ? "active" : ""} type="button" onClick={() => setTab("compra")}>
          Notas de compra
        </button>
        <button className={tab === "recebidas" ? "active" : ""} type="button" onClick={() => setTab("recebidas")}>
          Notas recebidas
        </button>
      </div>

      {tab === "recebidas" ? (
        <div className="erp-table-wrap fiscal-list-table">
          <table className="erp-table">
            <thead>
              <tr>
                <th>NF-e</th>
                <th>NSU</th>
                <th>Emissão</th>
                <th>Emitente</th>
                <th>Situação</th>
                <th className="num">Valor</th>
                <th className="actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredReceived.map((doc) => (
                <tr key={doc.id}>
                  <td>
                    <span className="mono bold">{doc.numero || "-"}</span>
                    {doc.serie && <small className="block-muted">Série {doc.serie}</small>}
                    {doc.chaveAcesso && <small className="block-muted">{doc.chaveAcesso}</small>}
                  </td>
                  <td>{doc.nsu || "-"}</td>
                  <td>{doc.dataEmissao ? new Date(doc.dataEmissao).toLocaleDateString("pt-BR") : "-"}</td>
                  <td>
                    <strong>{doc.emitenteNome}</strong>
                    {doc.emitenteDocumento && <small className="block-muted">{doc.emitenteDocumento}</small>}
                  </td>
                  <td>
                    <StatusBadge tone={doc.statusTone}>{doc.statusLabel}</StatusBadge>
                    {doc.resumo && <small className="block-muted">Resumo da NF-e</small>}
                    {doc.ultimoErro && <small className="block-muted">{doc.ultimoErro}</small>}
                  </td>
                  <td className="num">{new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(doc.valor)}</td>
                  <td className="actions">
                    {doc.entradaFiscalId ? (
                      <Button href={`/erp/entradas-fiscais/nova?id=${doc.entradaFiscalId}`} variant="light">Abrir entrada</Button>
                    ) : (
                      <Button type="button" variant="light" disabled={importingId === doc.id} onClick={() => importReceived(doc)}>
                        {importingId === doc.id ? "Importando..." : "Dar ciência e importar XML"}
                      </Button>
                    )}
                    {doc.canDownloadPdf && (
                      <a className="btn-erp ghost xs" href={`/api/erp/entradas-fiscais/distribuicao/${doc.id}/pdf`} target="_blank" rel="noopener noreferrer">
                        DANFE
                      </a>
                    )}
                    {doc.canDownloadXml && (
                      <a className="btn-erp ghost xs" href={`/api/erp/entradas-fiscais/distribuicao/${doc.id}/xml`}>
                        XML
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {!filteredReceived.length && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-st">Nenhuma NF-e recebida ainda. A sincronização roda automaticamente a cada hora — ou clique em &ldquo;Atualizar agora&rdquo;.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="erp-table-foot">
            <span>{filteredReceived.length} documentos exibidos</span>
            <strong>Total: {new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(filteredReceived.reduce((total, doc) => total + doc.valor, 0))}</strong>
          </div>
        </div>
      ) : (
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
      )}
    </section>
  );
}

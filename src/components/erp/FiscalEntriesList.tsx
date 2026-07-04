"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/shared/Button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { FiscalEntrySummary } from "@/lib/services/fiscal-entries";
import type { NfeDistributionSummary } from "@/lib/services/nfe-distribution";
import {
  NfseDespesaModal,
  type ClassificacaoOpt,
  type ContaFinanceiraOpt,
  type FormaPagamentoOpt
} from "@/components/erp/NfseDespesaModal";

type NfseRecebidaDoc = {
  id: string;
  nNFSe: string | null;
  chaveAcesso: string | null;
  emitenteNome: string | null;
  emitenteDocumento: string | null;
  valor: number;
  dataEmissao: string | null;
  contaPagarId?: string | null;
};

type FiscalEntriesListProps = {
  entries: FiscalEntrySummary[];
  receivedDocuments: NfeDistributionSummary[];
  ultimaSync?: string | null;
  nfseRecebidas?: NfseRecebidaDoc[];
  nfseSync?: string | null;
  lancada?: string | null;
  formasPagamento?: FormaPagamentoOpt[];
  contas?: ContaFinanceiraOpt[];
  classificacoes?: ClassificacaoOpt[];
};

type Tab = "compra" | "recebidas" | "nfse";
type PeriodoFiltro = "todos" | "mes" | "mes-passado" | "90" | "custom";

const PERIODOS: { valor: PeriodoFiltro; label: string }[] = [
  { valor: "todos", label: "Tudo" },
  { valor: "mes", label: "Este mês" },
  { valor: "mes-passado", label: "Mês passado" },
  { valor: "90", label: "Últimos 90 dias" }
];

type SituacaoFiltro = "todas" | "conferencia" | "registradas" | "canceladas";

const SITUACOES: { valor: SituacaoFiltro; label: string }[] = [
  { valor: "todas", label: "Todas" },
  { valor: "conferencia", label: "Em conferência" },
  { valor: "registradas", label: "Registradas" },
  { valor: "canceladas", label: "Canceladas/estornadas" }
];

/** Casa o status real da entrada com o grupo de situação selecionado. */
function matchSituacao(situacao: SituacaoFiltro, rawStatus: string): boolean {
  switch (situacao) {
    case "conferencia":
      return rawStatus === "AGUARDANDO_CONFERENCIA" || rawStatus === "CONFERIDA" || rawStatus === "RASCUNHO";
    case "registradas":
      return rawStatus === "ESTOQUE_PROCESSADO";
    case "canceladas":
      return rawStatus === "CANCELADA" || rawStatus === "ESTORNADA";
    default:
      return true;
  }
}

/** Intervalo [de, ate] (ms) do período selecionado; null = sem limite naquela ponta. */
function intervaloPeriodo(periodo: PeriodoFiltro, dataDe: string, dataAte: string): { de: number | null; ate: number | null } {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = agora.getMonth();
  switch (periodo) {
    case "mes":
      return { de: new Date(ano, mes, 1).getTime(), ate: null };
    case "mes-passado":
      return { de: new Date(ano, mes - 1, 1).getTime(), ate: new Date(ano, mes, 1).getTime() - 1 };
    case "90": {
      const d = new Date(agora);
      d.setDate(d.getDate() - 90);
      return { de: d.getTime(), ate: null };
    }
    case "custom":
      return {
        de: dataDe ? new Date(`${dataDe}T00:00:00`).getTime() : null,
        ate: dataAte ? new Date(`${dataAte}T23:59:59`).getTime() : null
      };
    default:
      return { de: null, ate: null };
  }
}

// Etapas da importação (Ciência → XML → lançamento). O backend é uma única
// chamada síncrona à SEFAZ via ACBr; aqui só damos feedback de progresso para o
// usuário entender que o sistema está trabalhando (e não travado).
const IMPORT_STEPS = [
  "Enviando Ciência da Operação à SEFAZ…",
  "Baixando o XML completo da NF-e…",
  "Lançando a nota para conferência…",
  "Abrindo a tela de lançamento…"
];

/** "Sincronizado há 3 h" a partir do ISO (relativo, mais acionável que a data absoluta). */
function syncRelativo(iso: string | null | undefined): string {
  if (!iso) return "Sincronização automática ativa (a cada hora)";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "Sincronizado agora";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "Sincronizado agora";
  if (min < 60) return `Sincronizado há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Sincronizado há ${h} h`;
  return `Sincronizado há ${Math.floor(h / 24)} d`;
}

export function FiscalEntriesList({ entries, receivedDocuments, ultimaSync, nfseRecebidas = [], nfseSync, lancada, formasPagamento = [], contas = [], classificacoes = [] }: FiscalEntriesListProps) {
  const [rows, setRows] = useState(entries);
  const [nfseRows, setNfseRows] = useState(nfseRecebidas);
  const [despesaAlvo, setDespesaAlvo] = useState<NfseRecebidaDoc | null>(null);
  const [avisoLancada, setAvisoLancada] = useState<string | null>(lancada ?? null);
  const [syncEm, setSyncEm] = useState<string | null>(ultimaSync ?? null);
  const [receivedRows, setReceivedRows] = useState(receivedDocuments);
  const [periodo, setPeriodo] = useState<PeriodoFiltro>("todos");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [situacao, setSituacao] = useState<SituacaoFiltro>("todas");
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
  const [selectedReceived, setSelectedReceived] = useState<string[]>([]);
  const [importLote, setImportLote] = useState<{ total: number; feito: number } | null>(null);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (stepTimer.current) clearInterval(stepTimer.current);
    };
  }, []);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const { de, ate } = intervaloPeriodo(periodo, dataDe, dataAte);

    return rows.filter((entry) => {
      // Filtro por situação (grupo de status).
      if (!matchSituacao(situacao, entry.rawStatus)) return false;

      // Filtro por período pela DATA DE EMISSÃO. Sem data de emissão fica fora de um período específico.
      if (de !== null || ate !== null) {
        const t = entry.issuedAtIso ? new Date(entry.issuedAtIso).getTime() : null;
        if (t === null) return false;
        if (de !== null && t < de) return false;
        if (ate !== null && t > ate) return false;
      }

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
    }).sort((a, b) => {
      // Mais recentes primeiro, pela data de emissão.
      const ta = a.issuedAtIso ? new Date(a.issuedAtIso).getTime() : 0;
      const tb = b.issuedAtIso ? new Date(b.issuedAtIso).getTime() : 0;
      return tb - ta;
    });
  }, [query, rows, periodo, dataDe, dataAte, situacao]);

  const filteredReceived = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const { de, ate } = intervaloPeriodo(periodo, dataDe, dataAte);

    return receivedRows.filter((doc) => {
      // Filtro por período (data de emissão). Notas sem data ficam fora de um período específico.
      if (de !== null || ate !== null) {
        const t = doc.dataEmissao ? new Date(doc.dataEmissao).getTime() : null;
        if (t === null) return false;
        if (de !== null && t < de) return false;
        if (ate !== null && t > ate) return false;
      }

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
    }).sort((a, b) => {
      // Mais recentes primeiro (por data de emissão); sem data vai para o fim.
      const ta = a.dataEmissao ? new Date(a.dataEmissao).getTime() : 0;
      const tb = b.dataEmissao ? new Date(b.dataEmissao).getTime() : 0;
      return tb - ta;
    });
  }, [query, receivedRows, periodo, dataDe, dataAte]);

  const filteredNfse = useMemo(() => {
    const { de, ate } = intervaloPeriodo(periodo, dataDe, dataAte);
    return nfseRows
      .filter((d) => {
        if (de === null && ate === null) return true;
        const t = d.dataEmissao ? new Date(d.dataEmissao).getTime() : null;
        if (t === null) return false;
        if (de !== null && t < de) return false;
        if (ate !== null && t > ate) return false;
        return true;
      })
      .sort((a, b) => {
        const ta = a.dataEmissao ? new Date(a.dataEmissao).getTime() : 0;
        const tb = b.dataEmissao ? new Date(b.dataEmissao).getTime() : 0;
        return tb - ta;
      });
  }, [nfseRows, periodo, dataDe, dataAte]);

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

  async function syncDistribution(mode: "sync-now" | "refresh" | "history" = "sync-now") {
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
        sync?: string;
        ciencias?: number;
        returned?: number;
        listed?: number;
        ultimaSync?: string | null;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível buscar as NF-e recebidas na SEFAZ.");
      }

      setReceivedRows(data.documents ?? []);
      if (data.ultimaSync) setSyncEm(data.ultimaSync);
      const partes: string[] = [];
      if (typeof data.ciencias === "number" && data.ciencias > 0) partes.push(`${data.ciencias} ciência(s) enviada(s) à SEFAZ`);
      if (data.sync) partes.push(`SEFAZ: ${data.sync}`);
      setMessage(partes.length ? `${partes.join(". ")}.` : "Sincronização concluída.");
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Não foi possível buscar as NF-e recebidas na SEFAZ.");
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

  function toggleReceived(id: string) {
    setSelectedReceived((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  /**
   * Importa em LOTE as NF-e recebidas selecionadas: para cada uma envia a Ciência e baixa o XML,
   * criando a entrada em "aguardando conferência" — SEM abrir a tela de cada nota. O usuário concilia
   * os itens depois, quando quiser. As notas já manifestadas não re-manifestam (o backend cuida).
   */
  async function importManySelected() {
    const importaveis = receivedRows.filter((d) => !d.entradaFiscalId);
    const ids = selectedReceived.filter((id) => importaveis.some((d) => d.id === id));
    if (!ids.length) return;
    if (!window.confirm(`Dar ciência e importar ${ids.length} NF-e recebida(s)? Elas vão para conferência (não movimentam estoque agora).`)) return;

    setError("");
    setMessage("");
    setImportLote({ total: ids.length, feito: 0 });
    let ok = 0;
    let comErro = 0;
    for (const id of ids) {
      try {
        const r = await fetch(`/api/erp/entradas-fiscais/distribuicao/${id}/importar`, { method: "POST" });
        const d = await r.json() as { entradaFiscalId?: string; error?: string };
        if (!r.ok || !d.entradaFiscalId) throw new Error(d.error || "falha");
        ok++;
      } catch {
        comErro++;
      }
      setImportLote((p) => (p ? { ...p, feito: p.feito + 1 } : p));
    }
    setImportLote(null);
    setSelectedReceived([]);
    const refresh = await fetch("/api/erp/entradas-fiscais/distribuicao").then((r) => r.json()).catch(() => null) as { documents?: NfeDistributionSummary[] } | null;
    if (refresh?.documents) setReceivedRows(refresh.documents);
    setMessage(`${ok} NF-e enviada(s) para conferência${comErro ? ` · ${comErro} com erro (talvez o XML completo ainda não esteja disponível — tente novamente em instantes)` : ""}. Confira na aba "Notas de compra".`);
  }

  const busy = Boolean(importingId) || syncing || navigating || Boolean(importLote);

  // Seleção em lote das NF-e recebidas ainda não importadas (sem entrada fiscal vinculada).
  const recebidasImportaveis = filteredReceived.filter((d) => !d.entradaFiscalId);
  const allReceivedSelected = recebidasImportaveis.length > 0 && recebidasImportaveis.every((d) => selectedReceived.includes(d.id));
  function toggleAllReceived() {
    if (allReceivedSelected) {
      setSelectedReceived((cur) => cur.filter((id) => !recebidasImportaveis.some((d) => d.id === id)));
    } else {
      setSelectedReceived((cur) => Array.from(new Set([...cur, ...recebidasImportaveis.map((d) => d.id)])));
    }
  }

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
            ) : importLote ? (
              <>
                <strong>Importando NF-e em lote… {importLote.feito} de {importLote.total}</strong>
                <small>Dando ciência e baixando o XML de cada nota. As notas vão para conferência. Não feche esta janela.</small>
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
            <span className="fiscal-list-filter" title={syncEm ? `Última sincronização: ${new Date(syncEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Roda automaticamente a cada hora.` : "A sincronização roda automaticamente a cada hora."}>
              {syncRelativo(syncEm)}
            </span>
            {selectedReceived.length > 0 && (
              <Button type="button" onClick={importManySelected} disabled={busy}>
                Importar selecionadas ({selectedReceived.length})
              </Button>
            )}
            <Button variant="light" type="button" onClick={() => syncDistribution()} disabled={syncing}>
              {syncing ? "Atualizando..." : "Atualizar agora"}
            </Button>
          </>
        ) : tab === "nfse" ? (
          <span className="fiscal-list-filter" title={nfseSync ? `Última sincronização do Ambiente Nacional: ${new Date(nfseSync).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Roda automaticamente a cada hora.` : "As NFS-e recebidas (tomador) são sincronizadas automaticamente do Ambiente Nacional a cada hora."}>
            {syncRelativo(nfseSync)}
          </span>
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

      {avisoLancada && (
        <div className="alert success fiscal-list-alert">
          <strong>✓ Nota lançada</strong>
          <span>NF-e {avisoLancada} lançada com sucesso — está aqui na aba “Notas de compra”.</span>
          <button type="button" className="link" style={{ marginLeft: "auto" }} onClick={() => setAvisoLancada(null)}>fechar</button>
        </div>
      )}
      {message && <div className="alert info fiscal-list-alert"><strong>OK</strong><span>{message}</span></div>}
      {error && <div className="alert danger fiscal-list-alert"><strong>Atenção</strong><span>{error}</span></div>}

      <div className="fiscal-list-tabs">
        <button className={tab === "compra" ? "active" : ""} type="button" onClick={() => setTab("compra")}>
          Notas de compra
        </button>
        <button className={tab === "recebidas" ? "active" : ""} type="button" onClick={() => setTab("recebidas")}>
          Notas recebidas NF
        </button>
        <button className={tab === "nfse" ? "active" : ""} type="button" onClick={() => setTab("nfse")}>
          Notas NFSE
        </button>
      </div>

      {tab === "recebidas" ? (
        <>
          <div className="fiscal-periodo-filtros">
            {PERIODOS.map((p) => (
              <button
                key={p.valor}
                type="button"
                className={`fiscal-chip${periodo === p.valor ? " ativo" : ""}`}
                onClick={() => { setPeriodo(p.valor); setDataDe(""); setDataAte(""); }}
              >
                {p.label}
              </button>
            ))}
            <span className="fiscal-periodo-sep" aria-hidden="true">|</span>
            <label className="fiscal-periodo-data">
              De
              <input
                type="date"
                value={dataDe}
                max={dataAte || undefined}
                onChange={(event) => { setDataDe(event.target.value); setPeriodo("custom"); }}
              />
            </label>
            <label className="fiscal-periodo-data">
              Até
              <input
                type="date"
                value={dataAte}
                min={dataDe || undefined}
                onChange={(event) => { setDataAte(event.target.value); setPeriodo("custom"); }}
              />
            </label>
            {periodo !== "todos" && (
              <button
                type="button"
                className="fiscal-chip-limpar"
                onClick={() => { setPeriodo("todos"); setDataDe(""); setDataAte(""); }}
              >
                Limpar filtro
              </button>
            )}
          </div>
          <div className="erp-table-wrap fiscal-list-table">
          <table className="erp-table">
            <thead>
              <tr>
                <th className="check">
                  <input
                    aria-label="Selecionar todas as importáveis"
                    type="checkbox"
                    checked={allReceivedSelected}
                    onChange={toggleAllReceived}
                  />
                </th>
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
                  <td className="check">
                    {!doc.entradaFiscalId && (
                      <input
                        aria-label={`Selecionar NF-e ${doc.numero || doc.chaveAcesso}`}
                        type="checkbox"
                        checked={selectedReceived.includes(doc.id)}
                        onChange={() => toggleReceived(doc.id)}
                      />
                    )}
                  </td>
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
                  <td colSpan={8}>
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
        </>
      ) : tab === "nfse" ? (
        <>
          <div className="fiscal-periodo-filtros">
            {PERIODOS.map((p) => (
              <button
                key={p.valor}
                type="button"
                className={`fiscal-chip${periodo === p.valor ? " ativo" : ""}`}
                onClick={() => { setPeriodo(p.valor); setDataDe(""); setDataAte(""); }}
              >
                {p.label}
              </button>
            ))}
            <span className="fiscal-periodo-sep" aria-hidden="true">|</span>
            <label className="fiscal-periodo-data">
              De
              <input
                type="date"
                value={dataDe}
                max={dataAte || undefined}
                onChange={(event) => { setDataDe(event.target.value); setPeriodo("custom"); }}
              />
            </label>
            <label className="fiscal-periodo-data">
              Até
              <input
                type="date"
                value={dataAte}
                min={dataDe || undefined}
                onChange={(event) => { setDataAte(event.target.value); setPeriodo("custom"); }}
              />
            </label>
            {periodo !== "todos" && (
              <button
                type="button"
                className="fiscal-chip-limpar"
                onClick={() => { setPeriodo("todos"); setDataDe(""); setDataAte(""); }}
              >
                Limpar filtro
              </button>
            )}
          </div>
          <div className="erp-table-wrap fiscal-list-table">
          <table className="erp-table">
            <thead>
              <tr>
                <th>NFS-e</th>
                <th>Prestador</th>
                <th>Emissão</th>
                <th className="num">Valor</th>
                <th className="actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredNfse.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span className="mono bold">{d.nNFSe || "-"}</span>
                    {d.chaveAcesso && <small className="block-muted">{d.chaveAcesso}</small>}
                  </td>
                  <td>
                    <strong>{d.emitenteNome || "-"}</strong>
                    {d.emitenteDocumento && <small className="block-muted">{d.emitenteDocumento}</small>}
                  </td>
                  <td>{d.dataEmissao ? new Date(d.dataEmissao).toLocaleDateString("pt-BR") : "-"}</td>
                  <td className="num">{new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(d.valor)}</td>
                  <td className="actions">
                    <a className="btn-erp ghost xs" href={`/api/erp/nfse-recebidas/${d.id}/pdf`} target="_blank" rel="noopener noreferrer">DANFSE</a>
                    <a className="btn-erp ghost xs" href={`/api/erp/nfse-recebidas/${d.id}/xml`}>XML</a>
                    {d.contaPagarId
                      ? <span className="status-badge success" style={{ fontSize: 11 }}>Despesa lançada</span>
                      : <button type="button" className="btn-erp primary xs" onClick={() => setDespesaAlvo(d)}>Lançar despesa</button>}
                  </td>
                </tr>
              ))}
              {!filteredNfse.length && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-st">Nenhuma NFS-e recebida (tomador) sincronizada ainda. A busca roda automaticamente a cada hora pelo Ambiente Nacional.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="erp-table-foot">
            <span>{filteredNfse.length} NFS-e exibidas</span>
            <strong>Total: {new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(filteredNfse.reduce((total, d) => total + d.valor, 0))}</strong>
          </div>
          </div>
        </>
      ) : (
        <>
          <div className="fiscal-periodo-filtros">
            {PERIODOS.map((p) => (
              <button
                key={p.valor}
                type="button"
                className={`fiscal-chip${periodo === p.valor ? " ativo" : ""}`}
                onClick={() => { setPeriodo(p.valor); setDataDe(""); setDataAte(""); }}
              >
                {p.label}
              </button>
            ))}
            <span className="fiscal-periodo-sep" aria-hidden="true">|</span>
            <label className="fiscal-periodo-data">
              De
              <input type="date" value={dataDe} max={dataAte || undefined} onChange={(event) => { setDataDe(event.target.value); setPeriodo("custom"); }} />
            </label>
            <label className="fiscal-periodo-data">
              Até
              <input type="date" value={dataAte} min={dataDe || undefined} onChange={(event) => { setDataAte(event.target.value); setPeriodo("custom"); }} />
            </label>
            {periodo !== "todos" && (
              <button type="button" className="fiscal-chip-limpar" onClick={() => { setPeriodo("todos"); setDataDe(""); setDataAte(""); }}>
                Limpar filtro
              </button>
            )}
          </div>
          <div className="fiscal-periodo-filtros">
            <span className="fiscal-periodo-data" style={{ border: "none" }}>Situação:</span>
            {SITUACOES.map((s) => (
              <button
                key={s.valor}
                type="button"
                className={`fiscal-chip${situacao === s.valor ? " ativo" : ""}`}
                onClick={() => setSituacao(s.valor)}
              >
                {s.label}
              </button>
            ))}
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
              <th>Emissão</th>
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
                <td>{entry.issuedAt || "-"}</td>
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
                <td colSpan={9}>
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
        </>
      )}

      {despesaAlvo && (
        <NfseDespesaModal
          doc={despesaAlvo}
          formasPagamento={formasPagamento}
          contas={contas}
          classificacoes={classificacoes}
          onClose={() => setDespesaAlvo(null)}
          onDone={(docId, contaPagarId) => {
            setNfseRows((current) => current.map((row) => (row.id === docId ? { ...row, contaPagarId } : row)));
            setDespesaAlvo(null);
            setMessage("Despesa da NFS-e lançada no contas a pagar.");
          }}
        />
      )}
    </section>
  );
}

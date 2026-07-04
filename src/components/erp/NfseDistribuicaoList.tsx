"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/shared/Button";
import {
  NfseDespesaModal,
  type ClassificacaoOpt,
  type ContaFinanceiraOpt,
  type FormaPagamentoOpt
} from "@/components/erp/NfseDespesaModal";

type NfseDoc = {
  id: string;
  nsu: string;
  chaveAcesso: string | null;
  nNFSe: string | null;
  papel: string | null;
  emitenteNome: string | null;
  emitenteDocumento: string | null;
  tomadorNome: string | null;
  tomadorDocumento: string | null;
  valor: number;
  dataEmissao: string | null;
  status: string;
  notaFiscalId: string | null;
  contaPagarId?: string | null;
};

type Props = {
  documents: NfseDoc[];
  ultimaSync?: string | null;
  formasPagamento?: FormaPagamentoOpt[];
  contas?: ContaFinanceiraOpt[];
  classificacoes?: ClassificacaoOpt[];
};

const PAPEIS = [
  { valor: "TODAS", label: "Todas" },
  { valor: "PRESTADOR", label: "Emitidas por mim" },
  { valor: "TOMADOR", label: "Recebidas (tomador)" }
] as const;

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(v);

/** Tempo relativo desde a última sincronização (mais acionável que a data absoluta). */
function syncRelativoNfse(iso: string | null): string {
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

export function NfseDistribuicaoList({ documents, ultimaSync, formasPagamento = [], contas = [], classificacoes = [] }: Props) {
  const [rows, setRows] = useState(documents);
  const [syncEm, setSyncEm] = useState<string | null>(ultimaSync ?? null);
  const [papel, setPapel] = useState<(typeof PAPEIS)[number]["valor"]>("PRESTADOR");
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [despesaAlvo, setDespesaAlvo] = useState<NfseDoc | null>(null);

  const filtered = useMemo(
    () => (papel === "TODAS" ? rows : rows.filter((d) => d.papel === papel)),
    [rows, papel]
  );

  async function sincronizar() {
    setSyncing(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/erp/nfse-recebidas", { method: "POST" });
      const data = await res.json() as {
        documents?: NfseDoc[]; ultimaSync?: string | null; novos?: number; prestador?: number;
        tomador?: number; status?: string; error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Não foi possível sincronizar as NFS-e.");
      setRows(data.documents ?? []);
      if (data.ultimaSync) setSyncEm(data.ultimaSync);
      const partes: string[] = [];
      if (typeof data.novos === "number") partes.push(`${data.novos} novo(s)`);
      if (data.status === "THROTTLING") partes.push("limite do Ambiente Nacional atingido — o restante vem na próxima sincronização");
      setMessage(partes.length ? partes.join(" · ") : "Sincronização concluída.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível sincronizar as NFS-e.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="fiscal-list">
      <div className="fiscal-list-actions">
        {PAPEIS.map((p) => (
          <button
            key={p.valor}
            type="button"
            className={`fiscal-chip${papel === p.valor ? " ativo" : ""}`}
            onClick={() => setPapel(p.valor)}
          >
            {p.label}
          </button>
        ))}
        <div className="toolbar-grow" />
        <span className="fiscal-list-filter" title={syncEm ? `Última sincronização: ${new Date(syncEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Roda automaticamente a cada hora.` : "A sincronização também roda automaticamente a cada hora."}>
          {syncRelativoNfse(syncEm)}
        </span>
        <Button type="button" onClick={sincronizar} disabled={syncing}>
          {syncing ? "Sincronizando..." : "Sincronizar agora"}
        </Button>
      </div>

      {message && <div className="alert info fiscal-list-alert"><strong>OK</strong><span>{message}</span></div>}
      {error && <div className="alert danger fiscal-list-alert"><strong>Atenção</strong><span>{error}</span></div>}

      <div className="erp-table-wrap fiscal-list-table">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Papel</th>
              <th>NFS-e</th>
              <th>Emitente</th>
              <th>Tomador</th>
              <th>Emissão</th>
              <th className="num">Valor</th>
              <th className="actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.id}>
                <td>
                  <span className={`fiscal-chip${d.papel === "PRESTADOR" ? " ativo" : ""}`} style={{ fontSize: 11 }}>
                    {d.papel === "PRESTADOR" ? "Emitida por mim" : d.papel === "TOMADOR" ? "Recebida" : "—"}
                  </span>
                </td>
                <td>
                  <span className="mono bold">{d.nNFSe || "-"}</span>
                  {d.chaveAcesso && <small className="block-muted">{d.chaveAcesso}</small>}
                </td>
                <td>
                  <strong>{d.emitenteNome || "-"}</strong>
                  {d.emitenteDocumento && <small className="block-muted">{d.emitenteDocumento}</small>}
                </td>
                <td>
                  <strong>{d.tomadorNome || "-"}</strong>
                  {d.tomadorDocumento && <small className="block-muted">{d.tomadorDocumento}</small>}
                </td>
                <td>{d.dataEmissao ? new Date(d.dataEmissao).toLocaleDateString("pt-BR") : "-"}</td>
                <td className="num">{brl(d.valor)}</td>
                <td className="actions">
                  <a className="btn-erp ghost xs" href={`/api/erp/nfse-recebidas/${d.id}/pdf`} target="_blank" rel="noopener noreferrer">DANFSE</a>
                  <a className="btn-erp ghost xs" href={`/api/erp/nfse-recebidas/${d.id}/xml`}>XML</a>
                  {d.papel === "TOMADOR" && (d.contaPagarId
                    ? <span className="status-badge success" style={{ fontSize: 11 }}>Despesa lançada</span>
                    : <button type="button" className="btn-erp primary xs" onClick={() => setDespesaAlvo(d)}>Lançar despesa</button>
                  )}
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-st">Nenhuma NFS-e sincronizada ainda. A busca roda automaticamente a cada hora — ou clique em &ldquo;Sincronizar agora&rdquo;.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="erp-table-foot">
          <span>{filtered.length} NFS-e exibidas</span>
          <strong>Total: {brl(filtered.reduce((t, d) => t + d.valor, 0))}</strong>
        </div>
      </div>

      {despesaAlvo && (
        <NfseDespesaModal
          doc={despesaAlvo}
          formasPagamento={formasPagamento}
          contas={contas}
          classificacoes={classificacoes}
          onClose={() => setDespesaAlvo(null)}
          onDone={(docId, contaPagarId) => {
            setRows((current) => current.map((row) => (row.id === docId ? { ...row, contaPagarId, status: "IMPORTADO" } : row)));
            setDespesaAlvo(null);
            setMessage("Despesa lançada no contas a pagar.");
          }}
        />
      )}
    </div>
  );
}

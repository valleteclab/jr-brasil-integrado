"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/shared/Button";

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
};

type Props = { documents: NfseDoc[]; ultimaSync?: string | null };

const PAPEIS = [
  { valor: "TODAS", label: "Todas" },
  { valor: "PRESTADOR", label: "Emitidas por mim" },
  { valor: "TOMADOR", label: "Recebidas (tomador)" }
] as const;

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(v);

export function NfseDistribuicaoList({ documents, ultimaSync }: Props) {
  const [rows, setRows] = useState(documents);
  const [syncEm, setSyncEm] = useState<string | null>(ultimaSync ?? null);
  const [papel, setPapel] = useState<(typeof PAPEIS)[number]["valor"]>("TODAS");
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
        <span className="fiscal-list-filter" title="A sincronização também roda automaticamente a cada hora.">
          {syncEm ? `Atualizado em ${new Date(syncEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "Sincronização automática ativa"}
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
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={6}>
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
    </div>
  );
}

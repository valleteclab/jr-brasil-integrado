"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { ImportarXmlResultado, SpedXmlSummary } from "@/domains/fiscal/application/sped-use-cases";

type Props = { documentos: SpedXmlSummary[] };

const formatBrl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Importa XMLs avulsos para o SPED: notas emitidas fora do ERP (outro emissor) e notas de
 * fornecedor que não passaram pelo fluxo de entradas — além de eventos de cancelamento.
 */
export function SpedXmlImport({ documentos }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [resultados, setResultados] = useState<ImportarXmlResultado[]>([]);
  const [aberto, setAberto] = useState(false);

  async function enviar(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setErro("");
    setResultados([]);
    try {
      const xmls = await Promise.all(Array.from(files).map((f) => f.text()));
      const res = await fetch("/api/erp/sped-fiscal/xml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xmls })
      });
      const data = (await res.json().catch(() => ({}))) as { resultados?: ImportarXmlResultado[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível importar os XMLs.");
      setResultados(data.resultados ?? []);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível importar os XMLs.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function excluir(doc: SpedXmlSummary) {
    if (!window.confirm(`Remover o XML da nota ${doc.numero ?? doc.chaveAcesso}? Ele deixa de entrar nas próximas gerações.`)) return;
    setBusy(true);
    setErro("");
    try {
      const res = await fetch(`/api/erp/sped-fiscal/xml/${doc.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível remover o XML.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível remover o XML.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0 }}>XMLs avulsos ({documentos.length})</h3>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--jr-mute)" }}>
            Notas emitidas fora do ERP ou recebidas sem o fluxo de entradas (aceita também eventos de
            cancelamento). Elas entram na geração do SPED da competência correspondente.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="button light sm" onClick={() => setAberto((v) => !v)}>
            {aberto ? "Ocultar lista" : "Ver lista"}
          </button>
          <button type="button" className="button primary sm" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? "Importando…" : "+ Importar XMLs"}
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xml,text/xml"
          multiple
          style={{ display: "none" }}
          onChange={(e) => enviar(e.target.files)}
        />
      </div>

      {erro && <p style={{ color: "var(--jr-danger)", fontSize: 13, margin: "10px 0 0" }}>{erro}</p>}

      {resultados.length > 0 && (
        <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--jr-slate)", display: "grid", gap: 4 }}>
          {resultados.map((r, i) => (
            <li key={i} style={{ color: r.ok ? "var(--jr-success)" : "var(--jr-danger)" }}>{r.mensagem}</li>
          ))}
        </ul>
      )}

      {aberto && documentos.length > 0 && (
        <div className="erp-table-wrap" style={{ marginTop: 12, maxHeight: 320, overflow: "auto" }}>
          <table className="erp-table">
            <thead>
              <tr>
                <th>Competência</th>
                <th>Tipo</th>
                <th>Documento</th>
                <th>Emitente / Destinatário</th>
                <th style={{ textAlign: "right" }}>Valor</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {documentos.map((d) => (
                <tr key={d.id}>
                  <td>{d.competencia}</td>
                  <td>{d.tipo === "SAIDA" ? "Saída" : "Entrada"}</td>
                  <td style={{ fontFamily: "var(--font-mono, monospace)" }}>
                    {d.modelo === "65" ? "NFC-e" : "NF-e"} {d.numero ?? "—"}/{d.serie ?? "—"}
                  </td>
                  <td>{d.tipo === "SAIDA" ? d.destinatarioNome ?? "Consumidor" : d.emitenteNome ?? "—"}</td>
                  <td style={{ textAlign: "right" }}>{formatBrl(d.valorTotal)}</td>
                  <td>{d.cancelada ? <StatusBadge tone="danger">Cancelada</StatusBadge> : <StatusBadge tone="success">Válida</StatusBadge>}</td>
                  <td>
                    <button type="button" className="button danger sm" onClick={() => excluir(d)} disabled={busy}>
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aberto && documentos.length === 0 && (
        <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--jr-mute)" }}>Nenhum XML avulso importado.</p>
      )}
    </div>
  );
}

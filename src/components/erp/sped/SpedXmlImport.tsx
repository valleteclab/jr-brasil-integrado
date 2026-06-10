"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { FINALIDADE_OPCOES } from "@/domains/fiscal/finalidade-entrada";
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
  const [competenciaFiltro, setCompetenciaFiltro] = useState<string>("");

  const competencias = Array.from(new Set(documentos.map((d) => d.competencia)));
  const visiveis = competenciaFiltro ? documentos.filter((d) => d.competencia === competenciaFiltro) : documentos;

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

  // Define a finalidade da NOTA inteira (entrada): decide o crédito de ICMS/PIS/COFINS no SPED.
  // Vazio = automática (regra De/Para → heurística). Vale na próxima geração do arquivo.
  async function definirFinalidade(doc: SpedXmlSummary, finalidade: string) {
    setBusy(true);
    setErro("");
    try {
      const res = await fetch(`/api/erp/sped-fiscal/xml/${doc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalidade: finalidade || null })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar a finalidade.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar a finalidade.");
    } finally {
      setBusy(false);
    }
  }

  // Remove TODOS os XMLs de uma competência — para recomeçar o mês com outro lote.
  async function limparCompetencia(competencia: string) {
    const [mes, ano] = competencia.split("/").map(Number);
    const qtd = documentos.filter((d) => d.competencia === competencia).length;
    const ok = window.confirm(
      `Remover TODOS os ${qtd} XMLs da competência ${competencia}?\n\n` +
        "Depois importe o novo lote e regere o SPED da competência (o arquivo antigo é substituído)."
    );
    if (!ok) return;
    setBusy(true);
    setErro("");
    try {
      const res = await fetch(`/api/erp/sped-fiscal/xml?ano=${ano}&mes=${mes}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível limpar a competência.");
      setCompetenciaFiltro("");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível limpar a competência.");
    } finally {
      setBusy(false);
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
            cancelamento). Cada XML fica guardado na competência da nota e entra SEMPRE que o SPED
            daquela competência for gerado — excluir o arquivo SPED não apaga os XMLs. Para recomeçar
            um mês com outro lote, use “Remover todos da competência”.
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <label className="field" style={{ minWidth: 160, margin: 0 }}>
            <span>Competência</span>
            <select value={competenciaFiltro} onChange={(e) => setCompetenciaFiltro(e.target.value)} disabled={busy}>
              <option value="">Todas ({documentos.length})</option>
              {competencias.map((c) => (
                <option key={c} value={c}>
                  {c} ({documentos.filter((d) => d.competencia === c).length})
                </option>
              ))}
            </select>
          </label>
          {competenciaFiltro && (
            <button
              type="button"
              className="button danger sm"
              onClick={() => limparCompetencia(competenciaFiltro)}
              disabled={busy}
              style={{ alignSelf: "flex-end" }}
            >
              Remover todos da competência {competenciaFiltro}
            </button>
          )}
        </div>
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
                <th>Finalidade (entrada)</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((d) => (
                <tr key={d.id}>
                  <td>{d.competencia}</td>
                  <td>{d.tipo === "SAIDA" ? "Saída" : "Entrada"}</td>
                  <td style={{ fontFamily: "var(--font-mono, monospace)" }}>
                    {d.modelo === "65" ? "NFC-e" : "NF-e"} {d.numero ?? "—"}/{d.serie ?? "—"}
                  </td>
                  <td>{d.tipo === "SAIDA" ? d.destinatarioNome ?? "Consumidor" : d.emitenteNome ?? "—"}</td>
                  <td style={{ textAlign: "right" }}>{formatBrl(d.valorTotal)}</td>
                  <td>
                    {d.tipo === "ENTRADA" && !d.cancelada ? (
                      <select
                        value={d.finalidadeNota ?? ""}
                        onChange={(e) => definirFinalidade(d, e.target.value)}
                        disabled={busy}
                        style={{ fontSize: 12, padding: "4px 6px" }}
                        title="Define o crédito de ICMS/PIS/COFINS desta nota no SPED. Vazio = automática (regra/heurística)."
                      >
                        <option value="">Automática</option>
                        {FINALIDADE_OPCOES.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      "—"
                    )}
                  </td>
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

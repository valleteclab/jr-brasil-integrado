"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { SpedArquivoSummary } from "@/domains/fiscal/application/sped-use-cases";

type Props = {
  arquivos: SpedArquivoSummary[];
  /** Mostra a ação de EXCLUIR (apenas perfil admin). */
  isAdmin?: boolean;
};

const formatBrl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function SpedArquivosList({ arquivos, isAdmin = false }: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  async function marcarEnviado(id: string) {
    setBusyId(id);
    setErro("");
    try {
      const res = await fetch(`/api/erp/sped-fiscal/${id}/enviado`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível marcar como enviado.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível marcar como enviado.");
    } finally {
      setBusyId(null);
    }
  }

  async function excluir(arquivo: SpedArquivoSummary) {
    const ok = window.confirm(
      `Excluir o arquivo SPED da competência ${arquivo.competencia}? O arquivo pode ser gerado novamente a qualquer momento.`
    );
    if (!ok) return;
    setBusyId(arquivo.id);
    setErro("");
    try {
      const res = await fetch(`/api/erp/sped-fiscal/${arquivo.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível excluir o arquivo.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível excluir o arquivo.");
    } finally {
      setBusyId(null);
    }
  }

  if (arquivos.length === 0) {
    return (
      <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--jr-slate)" }}>
        Nenhum arquivo SPED gerado ainda. Escolha a competência acima e clique em “Gerar SPED”.
      </div>
    );
  }

  return (
    <div className="erp-table-wrap">
      {erro && (
        <div className="system-error" style={{ marginBottom: 12 }}>
          <strong>Não foi possível concluir</strong>
          <span>{erro}</span>
        </div>
      )}
      <table className="erp-table">
        <thead>
          <tr>
            <th>Competência</th>
            <th>Leiaute</th>
            <th>Finalidade</th>
            <th>Status</th>
            <th style={{ textAlign: "right" }}>ICMS a recolher</th>
            <th style={{ textAlign: "right" }}>Saldo credor</th>
            <th style={{ textAlign: "right" }}>Linhas</th>
            <th style={{ textAlign: "right" }}>Avisos</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {arquivos.map((a) => (
            <tr key={a.id}>
              <td><Link href={`/erp/sped-fiscal/${a.id}`} style={{ fontWeight: 600 }}>{a.competencia}</Link></td>
              <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{a.versaoLeiaute}</td>
              <td>{a.finalidade === "RETIFICADORA" ? "Retificadora" : "Original"}</td>
              <td>
                <StatusBadge tone={a.status === "ENVIADO_CONTADOR" ? "success" : "info"}>
                  {a.status === "ENVIADO_CONTADOR" ? "Enviado ao contador" : "Gerado"}
                </StatusBadge>
              </td>
              <td style={{ textAlign: "right" }}>{formatBrl(a.icmsARecolher)}</td>
              <td style={{ textAlign: "right" }}>{formatBrl(a.saldoCredorTransportar)}</td>
              <td style={{ textAlign: "right" }}>{a.totalLinhas}</td>
              <td style={{ textAlign: "right" }}>
                {a.totalAvisos > 0 ? <StatusBadge tone="warn">{String(a.totalAvisos)}</StatusBadge> : "—"}
              </td>
              <td>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Link className="button light sm" href={`/erp/sped-fiscal/${a.id}`}>Apuração</Link>
                  <a className="button light sm" href={`/api/erp/sped-fiscal/${a.id}/download`}>Baixar .txt</a>
                  {a.status !== "ENVIADO_CONTADOR" && (
                    <button type="button" className="button dark sm" onClick={() => marcarEnviado(a.id)} disabled={busyId === a.id}>
                      {busyId === a.id ? "…" : "Marcar enviado"}
                    </button>
                  )}
                  {isAdmin && (
                    <button type="button" className="button danger sm" onClick={() => excluir(a)} disabled={busyId === a.id}>
                      Excluir
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

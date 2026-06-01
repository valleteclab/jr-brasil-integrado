"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { ClienteSummary } from "@/lib/services/platform-admin";

type Props = { clientes: ClienteSummary[] };

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

export function ClientesTable({ clientes }: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [erroId, setErroId] = useState<{ id: string; msg: string } | null>(null);

  async function alternar(cliente: ClienteSummary) {
    if (cliente.ativo) {
      const ok = window.confirm(`Bloquear o cliente "${cliente.nome}"? Os usuários dele perderão o acesso imediatamente.`);
      if (!ok) return;
    }
    const acao = cliente.ativo ? "bloquear" : "liberar";
    setBusyId(cliente.id);
    setErroId(null);
    try {
      const res = await fetch(`/api/admin/clientes/${cliente.id}/${acao}`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível concluir a ação.");
      router.refresh();
    } catch (e) {
      setErroId({ id: cliente.id, msg: e instanceof Error ? e.message : "Não foi possível concluir a ação." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="erp-table-wrap">
      <table className="erp-table">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Slug</th>
            <th>Status</th>
            <th className="num">Empresas</th>
            <th className="num">Usuários</th>
            <th>Último acesso</th>
            <th>Criado em</th>
            <th className="actions">Ações</th>
          </tr>
        </thead>
        <tbody>
          {clientes.length === 0 && (
            <tr>
              <td colSpan={8}>Nenhum cliente cadastrado ainda.</td>
            </tr>
          )}
          {clientes.map((c) => (
            <tr key={c.id}>
              <td><Link href={`/admin/clientes/${c.id}`} className="bold">{c.nome}</Link></td>
              <td className="mono">{c.slug}</td>
              <td><StatusBadge tone={c.statusTone}>{c.statusLabel}</StatusBadge></td>
              <td className="num">{c.totalEmpresas}</td>
              <td className="num">{c.totalUsuarios}</td>
              <td>{formatarData(c.ultimoAcessoEm)}</td>
              <td>{formatarData(c.criadoEm)}</td>
              <td className="actions">
                {erroId?.id === c.id && <div className="alert danger" style={{ marginBottom: 6 }}><span>{erroId.msg}</span></div>}
                {c.ativo ? (
                  <button type="button" className="btn-erp danger sm" onClick={() => alternar(c)} disabled={busyId === c.id}>
                    {busyId === c.id ? "Bloqueando…" : "Bloquear"}
                  </button>
                ) : (
                  <button type="button" className="btn-erp primary sm" onClick={() => alternar(c)} disabled={busyId === c.id}>
                    {busyId === c.id ? "Liberando…" : "Liberar"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

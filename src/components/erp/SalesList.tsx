"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SaleSummary } from "@/lib/services/sales";

type Props = {
  sales: SaleSummary[];
  /** Mostra a ação de EXCLUIR (apenas perfil admin). */
  isAdmin?: boolean;
};

export function SalesList({ sales, isAdmin = false }: Props) {
  const [rows, setRows] = useState(sales);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.numero, r.clienteNome, r.statusLabel, r.total].some((f) => f.toLowerCase().includes(q))
    );
  }, [query, rows]);

  function updateRow(id: string, patch: Partial<SaleSummary>) {
    setRows((current) => current.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function confirmar(row: SaleSummary) {
    if (!window.confirm(`Confirmar o pedido ${row.numero}? Isso efetivará a saída de estoque e criará conta a receber.`)) return;
    setBusyId(row.id);
    setError("");
    try {
      const res = await fetch(`/api/erp/vendas/${row.id}/confirmar`, { method: "POST" });
      const data = (await res.json()) as { error?: string; status?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível confirmar o pedido.");
      updateRow(row.id, {
        status: "AGUARDANDO_NOTA",
        statusLabel: "Aguardando nota",
        statusTone: "info",
        canConfirm: false,
        canInvoice: true,
        confirmadoEm: new Date().toLocaleDateString("pt-BR")
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao confirmar pedido.");
    } finally {
      setBusyId(null);
    }
  }

  async function faturar(row: SaleSummary) {
    if (!window.confirm(`Emitir NF-e para o pedido ${row.numero}?`)) return;
    setBusyId(row.id);
    setError("");
    try {
      const res = await fetch(`/api/erp/vendas/${row.id}/faturar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelo: "NFE" })
      });
      const data = (await res.json()) as { error?: string; status?: string; numero?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível emitir a nota fiscal.");
      updateRow(row.id, {
        status: "ENVIADO",
        statusLabel: "Faturado/Enviado",
        statusTone: "success",
        canConfirm: false,
        canInvoice: false,
        canCancel: false,
        temNotaAutorizada: true,
        faturadoEm: new Date().toLocaleDateString("pt-BR")
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao emitir nota fiscal.");
    } finally {
      setBusyId(null);
    }
  }

  async function cancelar(row: SaleSummary) {
    if (row.temNotaAutorizada) {
      window.alert("Não é possível cancelar: há nota fiscal autorizada vinculada. Cancele a nota fiscal antes.");
      return;
    }
    if (!window.confirm(`Cancelar o pedido ${row.numero}? Esta ação não pode ser desfeita.`)) return;
    setBusyId(row.id);
    setError("");
    try {
      const res = await fetch(`/api/erp/vendas/${row.id}/cancelar`, { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível cancelar o pedido.");
      updateRow(row.id, {
        status: "CANCELADO",
        statusLabel: "Cancelado",
        statusTone: "danger",
        canConfirm: false,
        canInvoice: false,
        canCancel: false,
        canceladoEm: new Date().toLocaleDateString("pt-BR")
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao cancelar pedido.");
    } finally {
      setBusyId(null);
    }
  }

  async function excluir(row: SaleSummary) {
    if (!window.confirm(`Excluir definitivamente o pedido ${row.numero}? Esta ação não pode ser desfeita.`)) return;
    setBusyId(row.id);
    setError("");
    try {
      const res = await fetch(`/api/erp/vendas/${row.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível excluir o pedido.");
      setRows((current) => current.filter((r) => r.id !== row.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir pedido.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <div className="erp-toolbar">
        <div className="toolbar-search">
          <span className="ic-sr" aria-hidden="true">⌕</span>
          <input
            className="search"
            placeholder="Buscar por número, cliente, status..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="grow" />
        <Link className="btn-erp primary sm" href="/erp/vendas/nova">+ Nova venda</Link>
      </div>

      {error && (
        <div className="alert danger">
          <strong>Atenção</strong>
          <span>{error}</span>
        </div>
      )}

      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Situação</th>
              <th className="num">Itens</th>
              <th className="num">Total</th>
              <th>Data</th>
              <th className="actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link className="mono bold link-detalhe" href={`/erp/vendas/${row.id}`}>{row.numero}</Link>
                  {row.canal === "LOJA" && <span className="canal-loja" title="Pedido recebido pela loja virtual">🛒 Loja</span>}
                  {row.faturadoEm && (
                    <small className="block-muted">Faturado em {row.faturadoEm}</small>
                  )}
                </td>
                <td>
                  <strong>{row.clienteNome}</strong>
                </td>
                <td>
                  <span className={`pill ${row.statusTone}`}>
                    <span className="dot" />
                    {row.statusLabel}
                  </span>
                  {row.temNotaAutorizada && (
                    <small className="block-muted">NF-e emitida</small>
                  )}
                </td>
                <td className="num">{row.itensCount}</td>
                <td className="num">{row.total}</td>
                <td>
                  <span>{row.criadoEm}</span>
                  {row.confirmadoEm && (
                    <small className="block-muted">Conf. {row.confirmadoEm}</small>
                  )}
                </td>
                <td className="actions">
                  {row.canConfirm && (
                    <button
                      className="btn-erp ghost xs"
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => confirmar(row)}
                    >
                      {busyId === row.id ? "Processando..." : "Confirmar"}
                    </button>
                  )}
                  {row.canInvoice && (
                    <button
                      className="btn-erp ghost xs"
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => faturar(row)}
                    >
                      {busyId === row.id ? "Processando..." : "Emitir NF-e"}
                    </button>
                  )}
                  {row.canCancel && (
                    <button
                      className="btn-erp danger xs"
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => cancelar(row)}
                    >
                      {busyId === row.id ? "Processando..." : "Cancelar"}
                    </button>
                  )}
                  {isAdmin && (row.status === "RASCUNHO" || row.status === "CANCELADO") && (
                    <button
                      className="btn-erp danger xs"
                      type="button"
                      title="Excluir pedido (admin)"
                      disabled={busyId === row.id}
                      onClick={() => excluir(row)}
                    >
                      {busyId === row.id ? "..." : "Excluir"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-st">
                    <h4>Nenhuma venda encontrada</h4>
                    <p>Clique em &quot;+ Nova venda&quot; para começar.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="erp-table-foot">
          <span>{filtered.length} de {rows.length} pedido(s)</span>
        </div>
      </div>
    </section>
  );
}

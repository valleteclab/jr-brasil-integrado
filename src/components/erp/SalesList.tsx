"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/shared/Button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { SaleSummary } from "@/lib/services/sales";

type Props = {
  sales: SaleSummary[];
};

export function SalesList({ sales }: Props) {
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

  return (
    <section className="op-list">
      <div className="op-toolbar">
        <div className="op-search">
          <span aria-hidden="true">⌕</span>
          <input
            placeholder="Buscar por número, cliente, status..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="toolbar-grow" />
        <Button href="/erp/vendas/nova" variant="primary">+ Nova venda</Button>
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
                  <span className="mono bold">{row.numero}</span>
                  {row.faturadoEm && (
                    <small className="block-muted">Faturado em {row.faturadoEm}</small>
                  )}
                </td>
                <td>
                  <strong>{row.clienteNome}</strong>
                </td>
                <td>
                  <StatusBadge tone={row.statusTone}>{row.statusLabel}</StatusBadge>
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
                      className="link-btn"
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => confirmar(row)}
                    >
                      {busyId === row.id ? "Processando..." : "Confirmar"}
                    </button>
                  )}
                  {row.canInvoice && (
                    <button
                      className="link-btn"
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => faturar(row)}
                    >
                      {busyId === row.id ? "Processando..." : "Emitir NF-e"}
                    </button>
                  )}
                  {row.canCancel && (
                    <button
                      className="danger-link"
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => cancelar(row)}
                    >
                      {busyId === row.id ? "Processando..." : "Cancelar"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-st">
                    Nenhuma venda encontrada. Clique em &quot;+ Nova venda&quot; para começar.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

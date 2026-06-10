"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type ComissaoRow = {
  id: string;
  vendedorId: string;
  vendedorNome: string;
  pedidoId: string | null;
  pedidoNumero: string;
  base: number;
  percentual: number;
  valor: number;
  status: string;
  criadoEm: string;
  pagoEm: string | null;
};

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const STATUS_LABEL: Record<string, string> = { A_PAGAR: "A pagar", PAGO: "Pago", CANCELADO: "Cancelado" };

/** Comissões por venda: filtro por vendedor/status, totais e baixa (admin). */
export function ComissoesList({
  comissoes,
  vendedores,
  isAdmin
}: {
  comissoes: ComissaoRow[];
  vendedores: Array<{ id: string; nome: string }>;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [vendedorId, setVendedorId] = useState("");
  const [status, setStatus] = useState("A_PAGAR");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const filtradas = useMemo(
    () =>
      comissoes.filter(
        (c) => (!vendedorId || c.vendedorId === vendedorId) && (!status || c.status === status)
      ),
    [comissoes, vendedorId, status]
  );
  const totalFiltrado = filtradas.reduce((s, c) => s + c.valor, 0);

  async function pagar(c: ComissaoRow) {
    if (!window.confirm(`Marcar como PAGA a comissão de ${c.vendedorNome} (${brl(c.valor)}, pedido ${c.pedidoNumero})?`)) return;
    setBusy(c.id);
    setError("");
    try {
      const res = await fetch(`/api/erp/comissoes/${c.id}/pagar`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível pagar a comissão.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível pagar a comissão.");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      {error && <div className="alert danger"><span>{error}</span></div>}

      <div className="erp-card">
        <div className="erp-card-head"><h3>Filtros</h3></div>
        <div className="erp-form">
          <label>
            <span>Vendedor</span>
            <select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
              <option value="">Todos</option>
              {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </label>
          <label>
            <span>Situação</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todas</option>
              <option value="A_PAGAR">A pagar</option>
              <option value="PAGO">Pagas</option>
              <option value="CANCELADO">Canceladas</option>
            </select>
          </label>
          <label>
            <span>Total filtrado</span>
            <input readOnly value={brl(totalFiltrado)} />
          </label>
        </div>
      </div>

      <div className="erp-card">
        <div className="erp-card-head"><h3>Comissões ({filtradas.length})</h3></div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Vendedor</th><th>Pedido</th><th className="num">Base</th><th className="num">%</th>
                <th className="num">Comissão</th><th>Situação</th><th>Gerada em</th>{isAdmin && <th className="actions"></th>}
              </tr>
            </thead>
            <tbody>
              {filtradas.map((c) => (
                <tr key={c.id}>
                  <td>{c.vendedorNome}</td>
                  <td className="mono">{c.pedidoId ? <a href={`/erp/vendas/${c.pedidoId}`}>{c.pedidoNumero}</a> : c.pedidoNumero}</td>
                  <td className="num">{brl(c.base)}</td>
                  <td className="num">{c.percentual.toFixed(2).replace(".", ",")}%</td>
                  <td className="num"><strong>{brl(c.valor)}</strong></td>
                  <td>{STATUS_LABEL[c.status] ?? c.status}{c.pagoEm ? ` em ${c.pagoEm}` : ""}</td>
                  <td>{c.criadoEm}</td>
                  {isAdmin && (
                    <td className="actions">
                      {c.status === "A_PAGAR" && (
                        <button type="button" className="btn-erp primary sm" onClick={() => pagar(c)} disabled={!!busy}>
                          {busy === c.id ? "Pagando…" : "Marcar paga"}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {filtradas.length === 0 && <tr><td colSpan={isAdmin ? 8 : 7} className="block-muted">Nenhuma comissão para o filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

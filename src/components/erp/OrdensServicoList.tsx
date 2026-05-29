"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/shared/Button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { OrdemServicoSummary } from "@/lib/services/service-order";

type Props = {
  oss: OrdemServicoSummary[];
};

export function OrdensServicoList({ oss }: Props) {
  const [rows, setRows] = useState(oss);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.numero, r.cliente, r.equipamento, r.statusLabel].some((f) =>
        f.toLowerCase().includes(q)
      )
    );
  }, [query, rows]);

  return (
    <section>
      <div className="erp-toolbar">
        <div className="toolbar-search">
          <span aria-hidden="true">⌕</span>
          <input
            className="search"
            placeholder="Buscar por número, cliente, equipamento..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="toolbar-grow" />
        <Button href="/erp/os/nova" variant="primary">+ Nova OS</Button>
      </div>

      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Cliente</th>
              <th>Equipamento</th>
              <th>Situação</th>
              <th>Previsão</th>
              <th className="num">Total</th>
              <th className="actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((os) => (
              <tr key={os.id}>
                <td>
                  <span className="mono bold">{os.numero}</span>
                  <small className="block-muted">{os.criadoEm}</small>
                </td>
                <td>
                  <strong>{os.cliente}</strong>
                </td>
                <td>
                  {os.equipamento}
                  {os.placaOuSerial && (
                    <small className="block-muted">{os.placaOuSerial}</small>
                  )}
                </td>
                <td>
                  <StatusBadge tone={os.statusTone}>{os.statusLabel}</StatusBadge>
                </td>
                <td>{os.previsaoEm ?? <span className="block-muted">—</span>}</td>
                <td className="num">
                  <strong>{os.total}</strong>
                  {Number(os.totalServicos.replace(/[^\d,]/g, "").replace(",", ".")) > 0 && (
                    <small className="block-muted">
                      serv. {os.totalServicos}
                    </small>
                  )}
                </td>
                <td className="actions">
                  <Button variant="light" href={`/erp/os/${os.id}`}>
                    Detalhes
                  </Button>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-st">Nenhuma ordem de serviço encontrada.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

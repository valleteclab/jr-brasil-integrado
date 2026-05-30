"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
          <span className="ic-sr" aria-hidden="true">⌕</span>
          <input
            className="search"
            placeholder="Buscar por número, cliente, equipamento…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="grow" />
        <Link className="btn-erp primary sm" href="/erp/os/nova">+ Nova OS</Link>
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
                  <span className="mono bold" style={{ color: "var(--erp-info)" }}>{os.numero}</span>
                  <span className="sublabel">{os.criadoEm}</span>
                </td>
                <td style={{ fontWeight: 600 }}>{os.cliente}</td>
                <td>
                  {os.equipamento}
                  {os.placaOuSerial && (
                    <span className="sublabel">{os.placaOuSerial}</span>
                  )}
                </td>
                <td>
                  <span className={`pill ${os.statusTone}`}>
                    <span className="dot" />
                    {os.statusLabel}
                  </span>
                </td>
                <td>{os.previsaoEm ?? <span style={{ color: "var(--erp-mute)" }}>—</span>}</td>
                <td className="num bold">
                  {os.total}
                  {Number(os.totalServicos.replace(/[^\d,]/g, "").replace(",", ".")) > 0 && (
                    <span className="sublabel">serv. {os.totalServicos}</span>
                  )}
                </td>
                <td className="actions">
                  <Link className="btn-erp ghost xs" href={`/erp/os/${os.id}`}>
                    Detalhes
                  </Link>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-st">
                    <h4>Nenhuma ordem de serviço</h4>
                    <p>Nenhuma ordem de serviço encontrada para a busca atual.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {filtered.length > 0 && (
          <div className="erp-table-foot">
            <span>{filtered.length} ordem(ns) de serviço</span>
            <div className="pagi">
              <button type="button" className="active">1</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

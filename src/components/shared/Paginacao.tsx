"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Paginação client-side reutilizável para listas grandes. Fatia a lista já filtrada e devolve a
 * página atual + os controles. Volta para a página 1 quando o total muda (ex.: aplicou um filtro).
 *
 *   const { pagina, setPagina, itensPagina, totalPaginas, inicio, fim } = usePaginado(filtrados, 20);
 *   ...render itensPagina...
 *   <Paginacao pagina={pagina} totalPaginas={totalPaginas} onPagina={setPagina} inicio={inicio} fim={fim} total={filtrados.length} />
 */
export function usePaginado<T>(itens: T[], porPagina = 20) {
  const [pagina, setPagina] = useState(1);
  const total = itens.length;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  // Corrige a página se o total encolheu (filtro) — evita ficar numa página vazia.
  useEffect(() => {
    if (pagina > totalPaginas) setPagina(1);
  }, [pagina, totalPaginas]);

  const itensPagina = useMemo(() => {
    const p = Math.min(pagina, totalPaginas);
    const inicio = (p - 1) * porPagina;
    return itens.slice(inicio, inicio + porPagina);
  }, [itens, pagina, porPagina, totalPaginas]);

  const paginaSegura = Math.min(pagina, totalPaginas);
  const inicio = total === 0 ? 0 : (paginaSegura - 1) * porPagina + 1;
  const fim = Math.min(paginaSegura * porPagina, total);

  return { pagina: paginaSegura, setPagina, itensPagina, totalPaginas, inicio, fim, total };
}

export function Paginacao({
  pagina,
  totalPaginas,
  onPagina,
  inicio,
  fim,
  total,
  rotuloItem = "registros"
}: {
  pagina: number;
  totalPaginas: number;
  onPagina: (p: number) => void;
  inicio: number;
  fim: number;
  total: number;
  rotuloItem?: string;
}) {
  if (total === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 4px", flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, color: "var(--erp-slate, #475569)" }}>
        {inicio}–{fim} de {total} {rotuloItem}
      </span>
      {totalPaginas > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button type="button" className="btn-erp ghost xs" disabled={pagina <= 1} onClick={() => onPagina(1)} title="Primeira página">«</button>
          <button type="button" className="btn-erp ghost xs" disabled={pagina <= 1} onClick={() => onPagina(pagina - 1)}>‹ Anterior</button>
          <span style={{ fontSize: 13, color: "var(--erp-slate, #475569)", minWidth: 90, textAlign: "center" }}>Página {pagina} / {totalPaginas}</span>
          <button type="button" className="btn-erp ghost xs" disabled={pagina >= totalPaginas} onClick={() => onPagina(pagina + 1)}>Próxima ›</button>
          <button type="button" className="btn-erp ghost xs" disabled={pagina >= totalPaginas} onClick={() => onPagina(totalPaginas)} title="Última página">»</button>
        </div>
      )}
    </div>
  );
}

/** Filtro por período reutilizável: retorna se uma data cai no intervalo [de, ate] (inclusivo). */
export function noPeriodo(data: Date | string | null | undefined, de: string, ate: string): boolean {
  if (!de && !ate) return true;
  if (!data) return false;
  const d = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(d.getTime())) return false;
  if (de) {
    const inicio = new Date(`${de}T00:00:00`);
    if (d < inicio) return false;
  }
  if (ate) {
    const fim = new Date(`${ate}T23:59:59`);
    if (d > fim) return false;
  }
  return true;
}

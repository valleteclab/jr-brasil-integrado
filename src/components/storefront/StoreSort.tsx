"use client";

import { useRouter, useSearchParams } from "next/navigation";

/** Seletor de ordenação da vitrine — navega preservando busca/categoria ao mudar. */
export function StoreSort({ base }: { base: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const atual = params.get("ordenar") ?? "recentes";

  function mudar(valor: string) {
    const sp = new URLSearchParams(params.toString());
    if (valor && valor !== "recentes") sp.set("ordenar", valor);
    else sp.delete("ordenar");
    const qs = sp.toString();
    router.push(qs ? `${base}?${qs}` : base);
  }

  return (
    <label className="store-sort">
      <span>Ordenar:</span>
      <select value={atual} onChange={(e) => mudar(e.target.value)} aria-label="Ordenar produtos">
        <option value="recentes">Mais recentes</option>
        <option value="preco-asc">Menor preço</option>
        <option value="preco-desc">Maior preço</option>
        <option value="nome">Nome (A–Z)</option>
      </select>
    </label>
  );
}

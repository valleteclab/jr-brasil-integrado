"use client";

import { useState } from "react";

/**
 * Imagem de produto da loja com carregamento preguiçoso e FALLBACK para imagem quebrada. As imagens
 * vêm de fontes externas (Dataload/Open Food Facts, por hotlink) ou base64 — se o link morrer, em vez
 * de um buraco mostra um placeholder limpo (ícone + SKU). Garante que a vitrine nunca "quebre".
 */
export function StoreImage({ src, alt, sku }: { src?: string | null; alt: string; sku?: string | null }) {
  const [erro, setErro] = useState(false);
  const usarImg = Boolean(src) && !erro;

  if (usarImg) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="store-img" src={src as string} alt={alt} loading="lazy" decoding="async" onError={() => setErro(true)} />
    );
  }
  return (
    <span className="store-img-ph" aria-hidden="true">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
      {sku ? <em>{sku}</em> : null}
    </span>
  );
}

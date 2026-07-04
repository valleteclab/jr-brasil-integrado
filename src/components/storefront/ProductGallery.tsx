"use client";

import { useState } from "react";
import { StoreImage } from "./StoreImage";

/**
 * Galeria de imagens do produto no detalhe da loja: imagem principal grande + miniaturas clicáveis
 * (quando há mais de uma). Reaproveita StoreImage (fallback para imagem quebrada).
 */
export function ProductGallery({ images, alt, sku }: { images: string[]; alt: string; sku?: string | null }) {
  const [ativa, setAtiva] = useState(0);
  const principal = images[ativa] ?? images[0] ?? null;

  return (
    <div className="produto-galeria">
      <div className="produto-foto">
        <StoreImage src={principal} alt={alt} sku={sku} />
      </div>
      {images.length > 1 && (
        <div className="produto-thumbs">
          {images.slice(0, 8).map((url, i) => (
            <button
              key={i}
              type="button"
              className={`produto-thumb ${i === ativa ? "ativa" : ""}`}
              aria-label={`Imagem ${i + 1}`}
              onClick={() => setAtiva(i)}
            >
              <StoreImage src={url} alt={`${alt} — ${i + 1}`} sku={sku} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import type { StorefrontProduct } from "@/lib/services/products";
import { useCart } from "./CartProvider";

export function AddToCartButton({ product }: { product: StorefrontProduct }) {
  const { add, slug } = useCart();
  const [qtd, setQtd] = useState(1);
  const [adicionado, setAdicionado] = useState(false);

  function adicionar() {
    add({ id: product.id, sku: product.sku, nome: product.name, preco: product.priceValue, imageUrl: product.imageUrl }, qtd);
    setAdicionado(true);
  }

  return (
    <div className="produto-add">
      <div className="produto-qtd">
        <button type="button" onClick={() => setQtd((q) => Math.max(1, q - 1))} aria-label="Diminuir">−</button>
        <input
          type="number"
          min={1}
          value={qtd}
          onChange={(e) => setQtd(Math.max(1, Number(e.target.value) || 1))}
        />
        <button type="button" onClick={() => setQtd((q) => q + 1)} aria-label="Aumentar">+</button>
      </div>
      <button type="button" className="button primary" onClick={adicionar}>Adicionar ao carrinho</button>
      {adicionado && <Link className="button dark" href={`/loja/${slug}/carrinho`}>Ir para o carrinho →</Link>}
    </div>
  );
}

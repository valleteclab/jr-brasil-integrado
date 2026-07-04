"use client";

import Link from "next/link";
import { useState } from "react";
import type { StorefrontProduct } from "@/lib/services/products";
import { useCart } from "./CartProvider";
import { StoreImage } from "./StoreImage";

type ProductCardProps = {
  product: StorefrontProduct;
};

export function ProductCard({ product }: ProductCardProps) {
  const { add, slug } = useCart();
  const [adicionado, setAdicionado] = useState(false);
  const href = `/loja/${slug}/produto/${product.id}`;

  function adicionar() {
    add({ id: product.id, sku: product.sku, nome: product.name, preco: product.priceValue, imageUrl: product.imageUrl });
    setAdicionado(true);
    window.setTimeout(() => setAdicionado(false), 1500);
  }

  return (
    <article className="card product-card">
      <Link href={href} className="product-media" aria-label={product.name}>
        <StoreImage src={product.imageUrl} alt={product.name} sku={product.sku} />
      </Link>
      <div className="product-meta">
        <span className="sku">{product.sku}</span>
        <span>{product.brand}</span>
      </div>
      <Link href={href}><h2>{product.name}</h2></Link>
      <p>{product.category}</p>
      <span className="eyebrow">A partir de</span>
      <strong>{product.price}</strong>
      <p>Disponível: {product.stockLabel}</p>
      <div className="actions compact">
        <button type="button" className="button primary" onClick={adicionar}>
          {adicionado ? "Adicionado ✓" : "Adicionar"}
        </button>
        <Link className="button light" href={href}>Ver</Link>
      </div>
    </article>
  );
}

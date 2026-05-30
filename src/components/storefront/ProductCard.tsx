import { Button } from "@/components/shared/Button";
import type { StorefrontProduct } from "@/lib/services/products";

type ProductCardProps = {
  product: StorefrontProduct;
};

export function ProductCard({ product }: ProductCardProps) {
  return (
    <article className="card product-card">
      <div
        className="product-media"
        aria-hidden="true"
        style={product.imageUrl ? { backgroundImage: `url(${product.imageUrl})` } : undefined}
      >
        {!product.imageUrl && <span>{product.sku}</span>}
      </div>
      <div className="product-meta">
        <span className="sku">{product.sku}</span>
        <span>{product.brand}</span>
      </div>
      <h2>{product.name}</h2>
      <p>{product.category}</p>
      <span className="eyebrow">A partir de</span>
      <strong>{product.price}</strong>
      <p>Disponível: {product.stockLabel}</p>
      <div className="actions compact">
        <Button>Comprar</Button>
        <Button variant="light">Orçar</Button>
      </div>
    </article>
  );
}

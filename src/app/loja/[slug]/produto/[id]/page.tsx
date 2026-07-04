import Link from "next/link";
import { notFound } from "next/navigation";
import { getStorefrontProduct } from "@/lib/services/products";
import { getLojaInfo } from "@/lib/services/loja";
import { AddToCartButton } from "@/components/storefront/AddToCartButton";
import { ProductGallery } from "@/components/storefront/ProductGallery";

export const dynamic = "force-dynamic";

export default async function ProdutoLojaPage({ params }: { params: { slug: string; id: string } }) {
  const loja = await getLojaInfo(params.slug);
  if (!loja) notFound();
  const product = await getStorefrontProduct(loja.scope, params.id);
  if (!product) notFound();
  const base = `/loja/${loja.slug}`;

  return (
    <main className="store-shell">
      <header className="store-header">
        <Link href={base} className="brand-inline">
          {loja.logoSistema ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={loja.logoSistema} alt={loja.nome} style={{ maxHeight: 36, maxWidth: 160, objectFit: "contain" }} />
          ) : (
            <strong>{loja.nome}</strong>
          )}
        </Link>
        <Link className="button dark" href={`${base}/carrinho`}>Meu carrinho</Link>
      </header>

      <Link href={base} className="store-voltar">← Voltar ao catálogo</Link>

      <section className="produto-detalhe">
        <ProductGallery images={product.images ?? []} alt={product.name} sku={product.sku} />
        <div className="produto-info">
          <span className="sku">{product.sku} · {product.brand}</span>
          <h1>{product.name}</h1>
          <p className="produto-categoria">{product.category}</p>
          <strong className="produto-preco">{product.price}</strong>
          <p className="produto-estoque">Disponível: {product.stockLabel}</p>
          {product.description && <p className="produto-desc">{product.description}</p>}
          <AddToCartButton product={product} />
        </div>
      </section>
    </main>
  );
}

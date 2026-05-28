import Link from "next/link";
import { ProductCard } from "@/components/storefront/ProductCard";
import { listStorefrontProducts } from "@/lib/services/products";
import type { StorefrontProduct } from "@/lib/services/products";

export const dynamic = "force-dynamic";

const categories = ["Peças Agrícolas", "Peças Automotivas", "Peças Industriais", "Serviços de oficina"];

export default async function StorePage() {
  let products: StorefrontProduct[] = [];
  let loadError = "";

  try {
    products = await listStorefrontProducts();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar o catálogo.";
  }

  return (
    <main className="store-shell">
      <header className="store-header">
        <Link href="/" className="brand-inline"><span className="brand-mark">JR</span><strong>JR Brasil</strong></Link>
        <nav>
          {categories.map((category) => <a key={category}>{category}</a>)}
        </nav>
        <button className="button dark" type="button">Minha conta</button>
      </header>
      <section className="store-hero">
        <span className="eyebrow">Ecommerce B2B integrado</span>
        <h1>Catálogo técnico para peças, serviços e orçamentos</h1>
        <p>Encontre peças por aplicação, consulte disponibilidade e solicite atendimento comercial especializado.</p>
      </section>
      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}
      <section className="grid three">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </section>
    </main>
  );
}

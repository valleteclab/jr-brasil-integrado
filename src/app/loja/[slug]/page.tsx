import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { ProductCard } from "@/components/storefront/ProductCard";
import { listStorefrontProducts, listStorefrontCategories } from "@/lib/services/products";
import type { StorefrontProduct } from "@/lib/services/products";
import { getLojaInfo } from "@/lib/services/loja";

export const dynamic = "force-dynamic";

function darken(hex: string, amount = 0.14): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex ?? "").trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amount));
  const g = Math.round(((n >> 8) & 255) * (1 - amount));
  const b = Math.round((n & 255) * (1 - amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

type StorePageProps = { params: { slug: string }; searchParams?: { q?: string; categoria?: string } };

export default async function StorePage({ params, searchParams }: StorePageProps) {
  const loja = await getLojaInfo(params.slug);
  if (!loja) notFound();

  const q = searchParams?.q?.trim() ?? "";
  const categoria = searchParams?.categoria?.trim() ?? "";
  const base = `/loja/${loja.slug}`;

  let products: StorefrontProduct[] = [];
  let categories: string[] = [];
  let loadError = "";
  try {
    [products, categories] = await Promise.all([
      listStorefrontProducts(loja.scope, { q, categoria }),
      listStorefrontCategories(loja.scope)
    ]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar o catálogo.";
  }

  const temaVars = loja.corDestaque
    ? ({ "--jr-yellow": loja.corDestaque, "--jr-yellow-dk": darken(loja.corDestaque), "--yellow": loja.corDestaque } as CSSProperties)
    : undefined;

  return (
    <main className="store-shell" style={temaVars}>
      <header className="store-header">
        <Link href={base} className="brand-inline">
          {loja.logoSistema ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={loja.logoSistema} alt={loja.nome} style={{ maxHeight: 36, maxWidth: 160, objectFit: "contain" }} />
          ) : (
            <>
              <span className="brand-mark">{loja.nome.slice(0, 2).toUpperCase()}</span>
              <strong>{loja.nome}</strong>
            </>
          )}
        </Link>
        <form className="store-search" action={base} method="get">
          {categoria && <input type="hidden" name="categoria" value={categoria} />}
          <input name="q" defaultValue={q} placeholder="Buscar produto, marca ou código…" aria-label="Buscar" />
          <button className="button primary" type="submit">Buscar</button>
        </form>
        <Link className="button dark" href={`${base}/carrinho`}>Meu carrinho</Link>
      </header>

      <nav className="store-cats">
        <Link className={!categoria ? "active" : ""} href={q ? `${base}?q=${encodeURIComponent(q)}` : base}>Todos</Link>
        {categories.map((cat) => {
          const sp = new URLSearchParams();
          sp.set("categoria", cat);
          if (q) sp.set("q", q);
          return <Link key={cat} className={categoria === cat ? "active" : ""} href={`${base}?${sp.toString()}`}>{cat}</Link>;
        })}
      </nav>

      {!q && !categoria && (
        <section className="store-hero">
          <span className="eyebrow">{loja.nome}</span>
          <h1>Faça seu pedido ou solicite um orçamento</h1>
          <p>Monte sua lista de produtos e envie. Nosso time finaliza o atendimento e entra em contato.</p>
        </section>
      )}

      {loadError && (
        <div className="system-error"><strong>Loja indisponível</strong><span>{loadError}</span></div>
      )}

      {!loadError && products.length === 0 ? (
        <div className="empty-st">
          <h4>Nenhum produto encontrado</h4>
          <p>{q || categoria ? "Tente outro termo ou categoria." : "Em breve novos produtos no catálogo."}</p>
        </div>
      ) : (
        <section className="grid three">
          {products.map((product) => <ProductCard key={product.id} product={product} />)}
        </section>
      )}
    </main>
  );
}

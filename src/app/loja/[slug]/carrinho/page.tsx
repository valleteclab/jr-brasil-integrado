import Link from "next/link";
import { notFound } from "next/navigation";
import { getLojaInfo } from "@/lib/services/loja";
import { CartView } from "@/components/storefront/CartView";

export const dynamic = "force-dynamic";

export default async function CarrinhoPage({ params }: { params: { slug: string } }) {
  const loja = await getLojaInfo(params.slug);
  if (!loja) notFound();
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
      </header>
      <h1 className="store-title">Meu carrinho</h1>
      <CartView />
    </main>
  );
}

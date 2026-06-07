import Link from "next/link";
import { notFound } from "next/navigation";
import { getLojaInfo } from "@/lib/services/loja";
import { CheckoutForm } from "@/components/storefront/CheckoutForm";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: { params: { slug: string } }) {
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
      <h1 className="store-title">Finalizar</h1>
      <CheckoutForm />
    </main>
  );
}

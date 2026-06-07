import Link from "next/link";

export const dynamic = "force-dynamic";

type Props = { params: { slug: string }; searchParams?: { tipo?: string; numero?: string } };

export default function EnviadoPage({ params, searchParams }: Props) {
  const orcamento = searchParams?.tipo === "ORCAMENTO";
  const numero = searchParams?.numero ?? "";

  return (
    <main className="store-shell">
      <section className="store-enviado">
        <div className="store-enviado-icon">✓</div>
        <h1>{orcamento ? "Orçamento solicitado!" : "Pedido enviado!"}</h1>
        <p>
          {orcamento ? "Recebemos sua solicitação de orçamento." : "Recebemos seu pedido."}{" "}
          {numero && <>Número <strong>{numero}</strong>.</>}
        </p>
        <p className="store-enviado-sub">
          Nossa equipe vai analisar e entrar em contato para confirmar valores, pagamento e entrega.
          Guarde o número para acompanhar.
        </p>
        <Link className="button primary" href={`/loja/${params.slug}`}>Voltar à loja</Link>
      </section>
    </main>
  );
}

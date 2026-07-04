import Link from "next/link";
import { getLojaInfo } from "@/lib/services/loja";

export const dynamic = "force-dynamic";

type Props = { params: { slug: string }; searchParams?: { tipo?: string; numero?: string } };

export default async function EnviadoPage({ params, searchParams }: Props) {
  const orcamento = searchParams?.tipo === "ORCAMENTO";
  const numero = searchParams?.numero ?? "";
  const loja = await getLojaInfo(params.slug);

  const msg = encodeURIComponent(
    `Olá! Acabei de enviar ${orcamento ? "um pedido de orçamento" : "um pedido"}${numero ? ` (nº ${numero})` : ""} pela loja online.`
  );
  const whatsapp = loja?.telefone ? `https://wa.me/55${loja.telefone}?text=${msg}` : null;

  return (
    <main className="store-shell">
      <section className="store-enviado">
        <div className="store-enviado-icon">✓</div>
        <h1>{orcamento ? "Orçamento solicitado!" : "Pedido enviado!"}</h1>
        <p>
          {orcamento ? "Recebemos sua solicitação de orçamento." : "Recebemos seu pedido."}{" "}
          {numero && <>Número <strong>{numero}</strong>.</>}
        </p>

        <ol className="store-enviado-passos">
          <li>Nossa equipe confere os itens e a disponibilidade.</li>
          <li>Entramos em contato para confirmar <strong>valores, pagamento e entrega</strong>.</li>
          <li>Com tudo certo, o pedido é finalizado e enviado.</li>
        </ol>

        <p className="store-enviado-sub">Guarde o número <strong>{numero || "do pedido"}</strong> para acompanhar o atendimento.</p>

        <div className="store-enviado-acoes">
          {whatsapp && (
            <a className="button primary" href={whatsapp} target="_blank" rel="noopener noreferrer">
              💬 Falar no WhatsApp
            </a>
          )}
          <Link className={whatsapp ? "button light" : "button primary"} href={`/loja/${params.slug}`}>Voltar à loja</Link>
        </div>
      </section>
    </main>
  );
}

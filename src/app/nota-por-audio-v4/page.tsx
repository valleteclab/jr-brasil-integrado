import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { VoxLanding } from "@/components/landing/VoxLanding";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "XERP Vox — o microfone é o novo teclado | Nota fiscal por áudio",
  description:
    "Fale uma frase. O Vox entende, você confirma EMITIR e a NF-e/NFS-e volta autorizada na conversa, com PDF — em 31 segundos. IA própria no Brasil: seu áudio não sai do servidor. Teste grátis.",
  openGraph: {
    title: "O microfone é o novo teclado.",
    description:
      "Aperte o orbe e veja: um áudio vira nota fiscal autorizada em 31 segundos — com confirmação antes e IA própria (seu áudio fica em casa).",
    type: "website"
  }
};

/** FAQ em JSON-LD (rich results no Google) — mesmo conteúdo exibido na página. */
const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "A IA emite a nota fiscal sozinha?",
      acceptedAnswer: { "@type": "Answer", text: "Nunca. Ela organiza tudo e espera você responder EMITIR. Sem a sua confirmação explícita, nenhuma nota, cobrança ou cancelamento acontece." }
    },
    {
      "@type": "Question",
      name: "Meu áudio vai parar em alguma big tech?",
      acceptedAnswer: { "@type": "Answer", text: "Não. A transcrição e a voz do assistente rodam em IA própria, nos nossos servidores no Brasil. Seu áudio não é usado para treinar modelos de terceiros." }
    },
    {
      "@type": "Question",
      name: "Preciso de certificado digital para emitir nota por áudio?",
      acceptedAnswer: { "@type": "Answer", text: "Sim, o certificado A1 (.pfx) da sua empresa — exigência da Receita. Você envia o arquivo pelo próprio chat e o sistema configura tudo." }
    },
    {
      "@type": "Question",
      name: "Funciona para serviço e comércio?",
      acceptedAnswer: { "@type": "Answer", text: "Sim: NFS-e para serviços, NF-e e NFC-e para comércio — emissão direta na SEFAZ e no padrão nacional das prefeituras." }
    }
  ]
};

export default async function NotaPorAudioV4Page() {
  const plano = await prisma.plataformaPlano
    .findUnique({ where: { codigo: "CHAT" } })
    .catch(() => null);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }} />
      <VoxLanding
        precoMensal={plano ? Number(plano.precoMensal) : 97}
        trialDias={plano?.trialDias ?? 7}
      />
    </>
  );
}

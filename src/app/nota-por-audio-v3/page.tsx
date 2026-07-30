import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { VoiceLiveLanding } from "@/components/landing/VoiceLiveLanding";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nota fiscal por áudio — fale e a nota sai autorizada | XERP",
  description:
    "Mande um áudio no WhatsApp ou Telegram: o assistente entende, você confirma e a NF-e/NFS-e volta autorizada na conversa, com PDF. IA própria — seu áudio não sai do servidor. Teste grátis.",
  openGraph: {
    title: "Aperte o play. É assim que se emite nota a partir de agora.",
    description:
      "Um áudio vira nota fiscal autorizada em 31 segundos — com confirmação antes e IA própria (seu áudio fica em casa).",
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
      acceptedAnswer: { "@type": "Answer", text: "Não. A transcrição e a voz do assistente rodam em IA própria, nos servidores da plataforma. Seu áudio não é usado para treinar modelos de terceiros." }
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

export default async function NotaPorAudioV3Page() {
  const plano = await prisma.plataformaPlano
    .findUnique({ where: { codigo: "CHAT" } })
    .catch(() => null);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }} />
      <VoiceLiveLanding
        precoMensal={plano ? Number(plano.precoMensal) : 97}
        trialDias={plano?.trialDias ?? 7}
      />
    </>
  );
}

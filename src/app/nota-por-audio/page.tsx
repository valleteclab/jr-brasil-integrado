import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { LaunchLanding } from "@/components/landing/LaunchLanding";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Emita nota fiscal por áudio | XERP",
  description:
    "Fale o que precisa. O XERP organiza os dados, pede sua confirmação e emite NF-e, NFC-e e NFS-e pelo chat. Teste grátis.",
  openGraph: {
    title: "Sua empresa não precisa de mais uma tela. Precisa de uma resposta.",
    description:
      "Conheça o XERP: o sistema que transforma uma mensagem de voz em nota fiscal, cobrança, venda e controle.",
    type: "website"
  }
};

export default async function NotaPorAudioPage() {
  const plano = await prisma.plataformaPlano
    .findUnique({ where: { codigo: "CHAT" } })
    .catch(() => null);

  return (
    <LaunchLanding
      precoMensal={plano ? Number(plano.precoMensal) : 97}
      trialDias={plano?.trialDias ?? 7}
    />
  );
}

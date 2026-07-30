import type { Metadata } from "next";
import { ConversionLanding } from "@/components/landing/ConversionLanding";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Emita Nota Fiscal por Áudio com IA | XERP — Fale e Pronto",
  description:
    "Fale o que aconteceu. O XERP organiza, confirma com você e emite NF-e, NFC-e e NFS-e. Teste grátis por 7 dias, sem cartão.",
  openGraph: {
    title: "Fale. A nota sai sozinha.",
    description:
      "Emita nota fiscal por áudio sem menu, sem campo e sem sistema para aprender. Você fala, confere e pronto.",
    type: "website"
  }
};

export default async function NotaPorAudioV2Page() {
  const plano = await prisma.plataformaPlano
    .findUnique({ where: { codigo: "CHAT" } })
    .catch(() => null);

  return (
    <ConversionLanding
      precoMensal={plano ? Number(plano.precoMensal) : 97}
      trialDias={plano?.trialDias ?? 7}
    />
  );
}

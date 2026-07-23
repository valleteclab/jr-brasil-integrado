import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { ChatLanding } from "@/components/landing/ChatLanding";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Assistente de IA para sua empresa — nota, Pix e boleto pelo WhatsApp e Telegram | XERP",
  description:
    "Um funcionário de IA no chat: emite NF-e/NFS-e, cobra por Pix e boleto e lança gastos pela foto do cupom. Teste grátis."
};

/** Landing pública do plano CHAT — nome/preço/trial/franquia vêm de /admin/planos (nada fixo). */
export default async function ChatLandingPage() {
  const plano = await prisma.plataformaPlano.findUnique({ where: { codigo: "CHAT" } }).catch(() => null);
  return (
    <ChatLanding
      nomePlano={plano?.nome ?? "Assistente por chat"}
      precoMensal={plano ? Number(plano.precoMensal) : null}
      trialDias={plano?.trialDias ?? 7}
      franquiaIaMes={plano?.franquiaIaMes ?? null}
    />
  );
}

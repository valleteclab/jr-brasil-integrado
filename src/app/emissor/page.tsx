import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { EmissorLanding } from "@/components/landing/EmissorLanding";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Emissor de Notas — NF-e e NFS-e para MEI e Simples | XERP",
  description:
    "Emita NF-e e NFS-e direto na SEFAZ em minutos, com PDF na hora, painel do Simples/MEI e pacote de XMLs para o contador. Teste grátis."
};

/** Landing pública do plano EMISSOR — preço/trial/limite vêm de /admin/planos (nada fixo). */
export default async function EmissorLandingPage() {
  const plano = await prisma.plataformaPlano.findUnique({ where: { codigo: "EMISSOR" } }).catch(() => null);
  return (
    <EmissorLanding
      precoMensal={plano ? Number(plano.precoMensal) : null}
      limiteNotasMes={plano?.limiteNotasMes ?? null}
      trialDias={plano?.trialDias ?? 7}
    />
  );
}

import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { BrasilLanding } from "@/components/landing/BrasilLanding";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "XERP — nota fiscal, caixa e cobrança no mesmo sistema",
  description:
    "Emita NF-e, cupom e nota de serviço direto na SEFAZ com o seu certificado. PDV, financeiro e assistente no WhatsApp. Teste grátis, sem cartão.",
  robots: { index: true, follow: true }
};

/** WhatsApp comercial da campanha (DDI+DDD+número, só dígitos). */
const WHATSAPP = "5577998755764";

/** Código da campanha: grava no lead e vai na mensagem do WhatsApp, para atribuição. */
const CAMPANHA = "brasil-instagram";

/**
 * Plano exibido na página, por ordem de preferência:
 *   1. `?plano=CODIGO` na URL (permite testar uma oferta antes de divulgar);
 *   2. o plano de código BRASIL — é onde o plano especial da campanha deve ser cadastrado;
 *   3. EMISSOR, como rede de segurança para a página nunca ficar sem oferta.
 * Preço, limite de notas e trial saem sempre do cadastro (/admin/planos).
 */
async function planoDaCampanha(codigoPedido?: string) {
  const candidatos = [codigoPedido?.trim().toUpperCase(), "BRASIL", "EMISSOR"].filter(
    (c): c is string => Boolean(c)
  );
  for (const codigo of candidatos) {
    const plano = await prisma.plataformaPlano
      .findFirst({ where: { codigo, ativo: true } })
      .catch(() => null);
    if (plano) {
      return {
        codigo: plano.codigo,
        nome: plano.nome,
        descricao: plano.descricao,
        precoMensal: Number(plano.precoMensal),
        limiteNotasMes: plano.limiteNotasMes,
        trialDias: plano.trialDias
      };
    }
  }
  return null;
}

/** Landing pública da campanha nacional (divulgação em perfil do Instagram). */
export default async function BrasilPage({
  searchParams
}: {
  searchParams?: { plano?: string };
}) {
  const plano = await planoDaCampanha(searchParams?.plano);
  return <BrasilLanding plano={plano} whatsapp={WHATSAPP} campanha={CAMPANHA} />;
}

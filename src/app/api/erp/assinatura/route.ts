import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { asaasCriarAssinatura, asaasGarantirCliente, getAsaasRuntime } from "@/lib/asaas/asaas-service";

/**
 * ASSINATURA da mensalidade do plano (Asaas): cria a subscription do tenant logado com o preço
 * definido em /admin/planos e devolve o link da primeira fatura. O webhook de pagamento confirma
 * e libera (limpa o trial). Reusa a assinatura existente se já houver.
 */
export async function POST() {
  try {
    const session = await getSession();
    if (!session?.scope) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    const { tenantId, empresaId } = session.scope;

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { nome: true, plano: true, assinaturaAsaasId: true } });
    if (!tenant) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    const plano = await prisma.plataformaPlano.findUnique({ where: { codigo: tenant.plano } });
    if (!plano || Number(plano.precoMensal) <= 0) {
      return NextResponse.json({ error: "Plano sem mensalidade configurada — fale com o suporte." }, { status: 400 });
    }
    const rt = await getAsaasRuntime();
    if (!rt) return NextResponse.json({ error: "Cobrança indisponível no momento — fale com o suporte." }, { status: 400 });

    const empresa = await prisma.empresa.findFirst({ where: { id: empresaId, tenantId }, select: { razaoSocial: true, cnpj: true, email: true } });
    const customerId = await asaasGarantirCliente(rt, {
      nome: tenant.nome || empresa?.razaoSocial || "Cliente",
      cpfCnpj: empresa?.cnpj ?? null,
      email: empresa?.email ?? session.email ?? null,
      externalReference: tenantId
    });

    const sub = await asaasCriarAssinatura(rt, {
      customerId,
      valor: Number(plano.precoMensal),
      descricao: `Assinatura ${plano.nome} — XERP`,
      externalReference: tenantId
    });
    await prisma.tenant.update({ where: { id: tenantId }, data: { assinaturaAsaasId: sub.id } });
    return NextResponse.json({ ok: true, assinaturaId: sub.id, invoiceUrl: sub.invoiceUrl, valor: Number(plano.precoMensal) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao criar a assinatura." }, { status: 500 });
  }
}

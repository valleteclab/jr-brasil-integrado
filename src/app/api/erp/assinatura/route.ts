import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { asaasCriarAssinatura, asaasAtualizarAssinatura, asaasGarantirCliente, getAsaasRuntime } from "@/lib/asaas/asaas-service";
import { precoMensalEfetivo } from "@/lib/services/platform-admin";

/**
 * ASSINATURA da mensalidade do plano (Asaas): cria a subscription do tenant logado com o valor
 * EFETIVO (personalizado do cliente, se houver; senão o preço do plano) e devolve o link da
 * primeira fatura. O webhook de pagamento confirma e libera (limpa o trial). Se já existe uma
 * assinatura, ATUALIZA o valor em vez de criar outra (evita cobrança dobrada).
 */
export async function POST() {
  try {
    const session = await getSession();
    if (!session?.scope) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    const { tenantId, empresaId } = session.scope;

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { nome: true, plano: true, assinaturaAsaasId: true, mensalidadeValor: true } });
    if (!tenant) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    const plano = await prisma.plataformaPlano.findUnique({ where: { codigo: tenant.plano } });
    const valor = precoMensalEfetivo(tenant.mensalidadeValor != null ? Number(tenant.mensalidadeValor) : null, Number(plano?.precoMensal ?? 0));
    if (valor <= 0) {
      return NextResponse.json({ error: "Plano sem mensalidade configurada — fale com o suporte." }, { status: 400 });
    }
    const rt = await getAsaasRuntime();
    if (!rt) return NextResponse.json({ error: "Cobrança indisponível no momento — fale com o suporte." }, { status: 400 });
    const descricao = `Assinatura ${plano?.nome ?? "XERP"} — XERP`;

    // Já tem assinatura → atualiza o valor (não cria duplicada).
    if (tenant.assinaturaAsaasId) {
      try {
        const upd = await asaasAtualizarAssinatura(rt, tenant.assinaturaAsaasId, { valor, descricao });
        return NextResponse.json({ ok: true, assinaturaId: upd.id, invoiceUrl: upd.invoiceUrl, valor });
      } catch (e) {
        console.warn("[assinatura] atualização falhou, criando nova:", e instanceof Error ? e.message : e);
      }
    }

    const empresa = await prisma.empresa.findFirst({ where: { id: empresaId, tenantId }, select: { razaoSocial: true, cnpj: true, email: true } });
    const customerId = await asaasGarantirCliente(rt, {
      nome: tenant.nome || empresa?.razaoSocial || "Cliente",
      cpfCnpj: empresa?.cnpj ?? null,
      email: empresa?.email ?? session.email ?? null,
      externalReference: tenantId
    });

    const sub = await asaasCriarAssinatura(rt, { customerId, valor, descricao, externalReference: tenantId });
    await prisma.tenant.update({ where: { id: tenantId }, data: { assinaturaAsaasId: sub.id } });
    return NextResponse.json({ ok: true, assinaturaId: sub.id, invoiceUrl: sub.invoiceUrl, valor });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao criar a assinatura." }, { status: 500 });
  }
}

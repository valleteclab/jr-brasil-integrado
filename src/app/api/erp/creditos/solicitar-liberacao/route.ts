import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { notificar } from "@/domains/comunicacao/application/comunicacao-use-cases";

/**
 * Vendedor bloqueado em venda faturada/limite pede LIBERAÇÃO ao financeiro — notifica o setor
 * financeiro (sino) com link para o cadastro do cliente. Body: { clienteId, motivo? }.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.scope) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    const body = (await request.json()) as { clienteId: string; motivo?: string };
    if (!body.clienteId) return NextResponse.json({ error: "Cliente não informado." }, { status: 400 });

    const cliente = await prisma.cliente.findFirst({
      where: { id: body.clienteId, ...scopedByTenantCompany(session.scope) },
      select: { razaoSocial: true, nomeFantasia: true }
    });
    const nome = cliente?.nomeFantasia ?? cliente?.razaoSocial ?? "cliente";
    const criadas = await notificar(session.scope, {
      setor: "financeiro",
      tipo: "CREDITO_LIBERACAO",
      titulo: "Liberação de venda faturada solicitada",
      mensagem: `${session.nome} pediu liberação de venda a prazo para ${nome}${body.motivo ? ` — ${body.motivo}` : ""}.`,
      link: "/erp/clientes"
    });
    return NextResponse.json({ ok: true, notificados: criadas });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: 500 });
  }
}

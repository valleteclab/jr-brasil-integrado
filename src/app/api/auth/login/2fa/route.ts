import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createSession } from "@/lib/auth/session";
import { TwoFactorError, verificarDesafio2fa } from "@/lib/auth/two-factor";

/** Segunda etapa do login: confere o código 2FA (WhatsApp) e SÓ ENTÃO abre a sessão. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { desafioId?: string; codigo?: string };
    if (!body.desafioId || !body.codigo) {
      return NextResponse.json({ error: "Informe o código recebido no WhatsApp." }, { status: 400 });
    }

    const { usuarioId } = await verificarDesafio2fa(body.desafioId, body.codigo);

    // Reaplica os mesmos gates do login (o estado pode ter mudado entre as etapas).
    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario || usuario.status !== "ATIVO") {
      return NextResponse.json({ error: "Usuário inativo." }, { status: 403 });
    }
    const vinculo = await prisma.usuarioVinculo.findFirst({
      where: { usuarioId, ativo: true },
      orderBy: { criadoEm: "asc" }
    });
    if (!vinculo?.empresaId) {
      return NextResponse.json({ error: "Usuário sem empresa/perfil ativo." }, { status: 403 });
    }
    const [tenant, empresa] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: vinculo.tenantId }, select: { ativo: true } }),
      prisma.empresa.findUnique({ where: { id: vinculo.empresaId }, select: { status: true } })
    ]);
    if (!tenant?.ativo || !empresa || empresa.status !== "ATIVA") {
      return NextResponse.json({ error: "Acesso suspenso. Procure o suporte da plataforma." }, { status: 403 });
    }

    await createSession(
      usuarioId,
      { tenantId: vinculo.tenantId, empresaId: vinculo.empresaId },
      request.headers.get("user-agent")
    );
    await prisma.usuario.update({ where: { id: usuarioId }, data: { ultimoAcessoEm: new Date() } });

    return NextResponse.json({ ok: true, redirect: "/erp" });
  } catch (error) {
    if (error instanceof TwoFactorError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "Erro ao validar o código.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

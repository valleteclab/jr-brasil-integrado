import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/security/password";
import { createSession } from "@/lib/auth/session";

// Login: valida e-mail/senha, abre sessão (cookie httpOnly) no vínculo ativo do usuário.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; senha?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    const senha = body.senha ?? "";
    if (!email || !senha) {
      return NextResponse.json({ error: "Informe e-mail e senha." }, { status: 400 });
    }

    const usuario = await prisma.usuario.findUnique({ where: { email } });
    // Mensagem genérica para não revelar se o e-mail existe.
    const invalido = NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
    if (!usuario || usuario.status !== "ATIVO") return invalido;
    if (!verifyPassword(senha, usuario.senhaHash)) return invalido;

    const vinculo = await prisma.usuarioVinculo.findFirst({
      where: { usuarioId: usuario.id, ativo: true },
      orderBy: { criadoEm: "asc" }
    });
    if (!vinculo || !vinculo.empresaId) {
      return NextResponse.json({ error: "Usuário sem empresa/perfil ativo. Procure o administrador." }, { status: 403 });
    }

    await createSession(
      usuario.id,
      { tenantId: vinculo.tenantId, empresaId: vinculo.empresaId },
      request.headers.get("user-agent")
    );
    await prisma.usuario.update({ where: { id: usuario.id }, data: { ultimoAcessoEm: new Date() } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao autenticar.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

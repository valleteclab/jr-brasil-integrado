import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getSession, SESSION_COOKIE } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/security/password";

/**
 * Troca de senha do usuário autenticado. Valida a senha atual, aplica a nova
 * (scrypt) e revoga as DEMAIS sessões do usuário, mantendo a sessão atual.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sessão expirada. Faça login novamente." }, { status: 401 });
    }

    const body = (await request.json()) as { senhaAtual?: string; novaSenha?: string };
    const senhaAtual = body.senhaAtual ?? "";
    const novaSenha = body.novaSenha ?? "";

    if (novaSenha.length < 8) {
      return NextResponse.json({ error: "A nova senha deve ter ao menos 8 caracteres." }, { status: 400 });
    }
    if (novaSenha === senhaAtual) {
      return NextResponse.json({ error: "A nova senha deve ser diferente da atual." }, { status: 400 });
    }

    const usuario = await prisma.usuario.findUnique({ where: { id: session.usuarioId } });
    if (!usuario || !verifyPassword(senhaAtual, usuario.senhaHash)) {
      return NextResponse.json({ error: "Senha atual incorreta." }, { status: 400 });
    }

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { senhaHash: hashPassword(novaSenha) }
    });

    // Revoga as outras sessões (encerra acessos antigos); mantém a sessão atual.
    const token = cookies().get(SESSION_COOKIE)?.value;
    const tokenHashAtual = token ? createHash("sha256").update(token).digest("hex") : "";
    await prisma.sessao.deleteMany({
      where: { usuarioId: usuario.id, tokenHash: { not: tokenHashAtual } }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao trocar a senha.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

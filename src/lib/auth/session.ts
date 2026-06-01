import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import type { ModuloKey } from "@/lib/auth/modules";
import { SESSION_COOKIE } from "@/lib/auth/cookie";

export { SESSION_COOKIE };
const SESSION_DAYS = 7;

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type SessionUser = {
  usuarioId: string;
  nome: string;
  email: string;
  scope: TenantScope;
  perfilNome: string;
  modulos: ModuloKey[];
};

/** Cria a sessão no banco e grava o cookie httpOnly. Use só em route handler/action. */
export async function createSession(
  userId: string,
  scope: TenantScope,
  userAgent?: string | null
): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiraEm = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.sessao.create({
    data: {
      usuarioId: userId,
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      tokenHash: tokenHash(token),
      expiraEm,
      userAgent: userAgent?.slice(0, 200) ?? null
    }
  });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiraEm
  });
}

/** Encerra a sessão atual (remove do banco e limpa o cookie). */
export async function destroySession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.sessao.deleteMany({ where: { tokenHash: tokenHash(token) } }).catch(() => undefined);
  }
  cookies().set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/**
 * Resolve o usuário autenticado a partir do cookie de sessão: valida token,
 * expiração e status do usuário, e carrega o perfil + módulos permitidos.
 * Retorna null quando não há sessão válida.
 */
export async function getSession(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const sessao = await prisma.sessao.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { usuario: true }
  });
  if (!sessao || sessao.expiraEm < new Date() || sessao.usuario.status !== "ATIVO") return null;

  // Vínculo ativo do usuário nesta empresa (define o perfil/permissões).
  const vinculo = await prisma.usuarioVinculo.findFirst({
    where: {
      usuarioId: sessao.usuarioId,
      tenantId: sessao.tenantId,
      empresaId: sessao.empresaId,
      ativo: true
    },
    include: { perfil: { include: { permissoes: true } } }
  });
  if (!vinculo) return null;

  // A existência de uma Permissao{modulo, acao:"acessar"} concede o módulo.
  const modulos = vinculo.perfil.permissoes
    .filter((p) => p.acao === "acessar")
    .map((p) => p.modulo as ModuloKey);

  return {
    usuarioId: sessao.usuarioId,
    nome: sessao.usuario.nome,
    email: sessao.usuario.email,
    scope: { tenantId: sessao.tenantId, empresaId: sessao.empresaId },
    perfilNome: vinculo.perfil.nome,
    modulos
  };
}

/** Escopo (tenant/empresa) do usuário autenticado. Lança se não houver sessão. */
export async function getSessionScope(): Promise<TenantScope> {
  const session = await getSession();
  if (!session) throw new SessionError("Sessão expirada ou inexistente. Faça login.");
  return session.scope;
}

export class SessionError extends Error {}

/** Exige acesso a um módulo; lança SessionError (sem sessão) ou ForbiddenError. */
export async function requireModulo(modulo: ModuloKey): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new SessionError("Sessão expirada ou inexistente. Faça login.");
  if (!session.modulos.includes(modulo)) {
    throw new ForbiddenError(`Sem permissão para o módulo: ${modulo}.`);
  }
  return session;
}

export class ForbiddenError extends Error {}

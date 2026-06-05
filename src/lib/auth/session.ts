import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import type { ModuloKey } from "@/lib/auth/modules";
import { TODOS_MODULOS, isAdminPerfil } from "@/lib/auth/modules";
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
  /** Escopo do cliente. Nulo para o dono da plataforma (conta sem vínculo a cliente). */
  scope: TenantScope | null;
  perfilNome: string;
  modulos: ModuloKey[];
  /** Dono do SaaS: acesso ao painel da plataforma (/admin), acima do tenant. */
  plataformaAdmin: boolean;
};

/**
 * Cria a sessão no banco e grava o cookie httpOnly. Use só em route handler/action.
 * `scope` nulo cria uma sessão sem cliente — usada pelo dono da plataforma.
 */
export async function createSession(
  userId: string,
  scope: TenantScope | null,
  userAgent?: string | null
): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiraEm = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.sessao.create({
    data: {
      usuarioId: userId,
      tenantId: scope?.tenantId ?? null,
      empresaId: scope?.empresaId ?? null,
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

  const plataformaAdmin = sessao.usuario.plataformaAdmin;

  // Sessão do dono da plataforma: conta sem vínculo a cliente (escopo nulo). Só vale
  // para quem é plataformaAdmin; serve apenas para o painel /admin (sem módulos de ERP).
  if (!sessao.tenantId || !sessao.empresaId) {
    if (!plataformaAdmin) return null;
    return {
      usuarioId: sessao.usuarioId,
      nome: sessao.usuario.nome,
      email: sessao.usuario.email,
      scope: null,
      perfilNome: "PLATAFORMA",
      modulos: [],
      plataformaAdmin: true
    };
  }

  const sessaoTenantId = sessao.tenantId;
  const sessaoEmpresaId = sessao.empresaId;

  // Enforcement de bloqueio do cliente (dono do SaaS): se o tenant estiver inativo
  // ou a empresa não estiver ATIVA, a sessão é negada. O dono da plataforma passa,
  // para nunca se trancar para fora ao bloquear o próprio tenant.
  if (!plataformaAdmin) {
    const [tenant, empresa] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: sessaoTenantId }, select: { ativo: true } }),
      prisma.empresa.findUnique({ where: { id: sessaoEmpresaId }, select: { status: true } })
    ]);
    if (!tenant?.ativo) return null;
    if (!empresa || empresa.status !== "ATIVA") return null;
  }

  // Vínculo ativo do usuário nesta empresa (define o perfil/permissões).
  const vinculo = await prisma.usuarioVinculo.findFirst({
    where: {
      usuarioId: sessao.usuarioId,
      tenantId: sessaoTenantId,
      empresaId: sessaoEmpresaId,
      ativo: true
    },
    include: { perfil: { include: { permissoes: true } } }
  });
  if (!vinculo) return null;

  // Perfis administrativos (SUPER_ADMIN/COMPANY_ADMIN/TENANT_ADMIN) têm acesso total,
  // independentemente das permissões gravadas. Demais perfis: a existência de uma
  // Permissao{modulo, acao:"acessar"} concede o módulo.
  const modulos = isAdminPerfil(vinculo.perfil.nome)
    ? [...TODOS_MODULOS]
    : (vinculo.perfil.permissoes
        .filter((p) => p.acao === "acessar")
        .map((p) => p.modulo as ModuloKey));

  return {
    usuarioId: sessao.usuarioId,
    nome: sessao.usuario.nome,
    email: sessao.usuario.email,
    scope: { tenantId: sessaoTenantId, empresaId: sessaoEmpresaId },
    perfilNome: vinculo.perfil.nome,
    modulos,
    plataformaAdmin
  };
}

/** Escopo (tenant/empresa) do usuário autenticado. Lança se não houver sessão/cliente. */
export async function getSessionScope(): Promise<TenantScope> {
  const session = await getSession();
  if (!session) throw new SessionError("Sessão expirada ou inexistente. Faça login.");
  if (!session.scope) throw new SessionError("Sessão sem cliente selecionado.");
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

/**
 * Exige que o usuário autenticado seja dono da plataforma (super admin global do
 * SaaS). Usado para proteger o painel /admin e suas APIs. Lança SessionError (sem
 * sessão) ou ForbiddenError (logado, mas sem acesso de plataforma).
 */
export async function requirePlatformAdmin(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new SessionError("Sessão expirada ou inexistente. Faça login.");
  if (!session.plataformaAdmin) {
    throw new ForbiddenError("Acesso restrito ao dono da plataforma.");
  }
  return session;
}

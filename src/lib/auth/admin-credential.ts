import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { verifyPassword } from "@/lib/security/password";
import { isAdminPerfil } from "@/lib/auth/modules";

export type CredencialAdmin = { email: string; senha: string };

/**
 * Valida APENAS a senha de um administrador do tenant (sem identificar por email):
 * itera sobre os usuários admins ATIVOS vinculados à empresa atual e retorna o primeiro
 * cuja hash bate. Caro com N grande (bcrypt por usuário); aceitável para N ≤ ~10 admins.
 * Mensagem genérica pra não vazar quantos admins existem nem qual etapa falhou.
 */
export async function validarSenhaAdmin(
  scope: TenantScope,
  senha: string
): Promise<{ usuarioId: string; nome: string }> {
  const invalido = new Error("Senha de administrador inválida.");
  const valor = (senha ?? "").trim();
  if (!valor) throw invalido;

  const vinculos = await prisma.usuarioVinculo.findMany({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId, ativo: true },
    include: {
      perfil: { select: { nome: true } },
      usuario: { select: { id: true, nome: true, senhaHash: true, status: true } }
    }
  });

  for (const v of vinculos) {
    if (!isAdminPerfil(v.perfil.nome)) continue;
    if (v.usuario.status !== "ATIVO") continue;
    if (verifyPassword(valor, v.usuario.senhaHash)) {
      return { usuarioId: v.usuario.id, nome: v.usuario.nome };
    }
  }
  throw invalido;
}

/**
 * Valida a credencial de um ADMINISTRADOR para autorizar uma ação pontual de outro
 * operador (ex.: desconto no PDV) — sem abrir sessão. Exige: usuário ATIVO, senha
 * correta e vínculo ativo com perfil administrativo NA MESMA empresa do escopo.
 * Mensagem de erro única para não revelar qual etapa falhou.
 */
export async function validarCredencialAdmin(
  scope: TenantScope,
  credencial: CredencialAdmin
): Promise<{ usuarioId: string; nome: string }> {
  const email = (credencial.email ?? "").trim().toLowerCase();
  const senha = credencial.senha ?? "";
  const invalido = new Error("Credencial de administrador inválida.");
  if (!email || !senha) throw invalido;

  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario || usuario.status !== "ATIVO") throw invalido;
  if (!verifyPassword(senha, usuario.senhaHash)) throw invalido;

  const vinculo = await prisma.usuarioVinculo.findFirst({
    where: {
      usuarioId: usuario.id,
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      ativo: true
    },
    include: { perfil: { select: { nome: true } } }
  });
  if (!vinculo || !isAdminPerfil(vinculo.perfil.nome)) throw invalido;

  return { usuarioId: usuario.id, nome: usuario.nome };
}

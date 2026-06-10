import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { verifyPassword } from "@/lib/security/password";
import { isAdminPerfil } from "@/lib/auth/modules";

export type CredencialAdmin = { email: string; senha: string };

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

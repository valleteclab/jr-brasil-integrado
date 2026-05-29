import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";

export class TeamValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamValidationError";
  }
}

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------

type PermissaoInput = {
  modulo: string;
  acao: string;
};

type CreatePerfilInput = {
  nome: string;
  descricao?: string;
  permissoes: PermissaoInput[];
};

export async function createPerfil(scope: TenantScope, input: CreatePerfilInput) {
  if (!input.nome?.trim()) {
    throw new TeamValidationError("Nome do perfil é obrigatório.");
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.perfil.findUnique({
      where: { tenantId_nome: { tenantId: scope.tenantId, nome: input.nome.trim() } }
    });

    if (existing) {
      throw new TeamValidationError(`Já existe um perfil com o nome "${input.nome}".`);
    }

    const perfil = await tx.perfil.create({
      data: {
        tenantId: scope.tenantId,
        nome: input.nome.trim(),
        descricao: input.descricao?.trim() ?? null,
        permissoes: {
          create: input.permissoes.map((p) => ({
            tenantId: scope.tenantId,
            modulo: p.modulo,
            acao: p.acao
          }))
        }
      },
      include: { permissoes: true }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "Perfil",
      entidadeId: perfil.id,
      acao: "CRIAR",
      payload: { nome: perfil.nome, permissoes: input.permissoes.length }
    });

    return perfil;
  });
}

// ---------------------------------------------------------------------------
// Colaborador / UsuarioVinculo
// ---------------------------------------------------------------------------

type InviteColaboradorInput = {
  nome: string;
  email: string;
  perfilId: string;
};

export async function inviteColaborador(scope: TenantScope, input: InviteColaboradorInput) {
  if (!input.nome?.trim()) throw new TeamValidationError("Nome é obrigatório.");
  if (!input.email?.trim()) throw new TeamValidationError("E-mail é obrigatório.");
  if (!input.perfilId) throw new TeamValidationError("Perfil é obrigatório.");

  return prisma.$transaction(async (tx) => {
    // Valida perfil pertence ao tenant
    const perfil = await tx.perfil.findFirst({
      where: { id: input.perfilId, tenantId: scope.tenantId }
    });
    if (!perfil) throw new TeamValidationError("Perfil não encontrado.");

    // Cria ou acha usuário pelo e-mail
    let usuario = await tx.usuario.findUnique({
      where: { email: input.email.toLowerCase().trim() }
    });

    if (!usuario) {
      usuario = await tx.usuario.create({
        data: {
          nome: input.nome.trim(),
          email: input.email.toLowerCase().trim(),
          senhaHash: "change-me",
          status: "ATIVO"
        }
      });
    }

    // Verifica se vínculo já existe
    const vinculoExistente = await tx.usuarioVinculo.findFirst({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        usuarioId: usuario.id,
        perfilId: input.perfilId
      }
    });
    if (vinculoExistente) {
      throw new TeamValidationError("Este colaborador já possui vínculo com este perfil nesta empresa.");
    }

    const vinculo = await tx.usuarioVinculo.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        usuarioId: usuario.id,
        perfilId: input.perfilId,
        ativo: true
      }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "UsuarioVinculo",
      entidadeId: vinculo.id,
      acao: "CONVIDAR",
      payload: { usuarioId: usuario.id, email: usuario.email, perfilId: input.perfilId }
    });

    return { vinculo, usuario };
  });
}

export async function setVinculoAtivo(scope: TenantScope, vinculoId: string, ativo: boolean) {
  return prisma.$transaction(async (tx) => {
    const vinculo = await tx.usuarioVinculo.findFirst({
      where: { id: vinculoId, ...scopedByTenantCompany(scope) }
    });
    if (!vinculo) throw new TeamValidationError("Vínculo não encontrado.");

    const updated = await tx.usuarioVinculo.update({
      where: { id: vinculoId },
      data: { ativo }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "UsuarioVinculo",
      entidadeId: vinculoId,
      acao: ativo ? "ATIVAR" : "DESATIVAR",
      payload: { usuarioId: vinculo.usuarioId }
    });

    return updated;
  });
}

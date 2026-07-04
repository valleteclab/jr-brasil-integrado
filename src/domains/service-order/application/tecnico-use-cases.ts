import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";

/**
 * Cadastro de TÉCNICOS/MECÂNICOS da oficina. Um técnico pode ter um LOGIN vinculado (usuarioId):
 * quando esse usuário abre uma OS, o sistema o reconhece como o técnico e atribui os apontamentos
 * automaticamente. custoHora é interno (base para custo real / produtividade).
 */

export class TecnicoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TecnicoError";
  }
}

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export type TecnicoInput = {
  nome?: string;
  especialidade?: string | null;
  telefone?: string | null;
  custoHora?: number | null;
  usuarioId?: string | null;
  ativo?: boolean;
};

export type TecnicoResumo = {
  id: string;
  nome: string;
  especialidade: string | null;
  telefone: string | null;
  custoHora: number;
  usuarioId: string | null;
  usuarioNome: string | null;
  ativo: boolean;
  osAbertas: number;
};

export async function listTecnicos(scope: TenantScope, opts?: { incluirInativos?: boolean }): Promise<TecnicoResumo[]> {
  const tecnicos = await prisma.tecnico.findMany({
    where: { ...scopedByTenantCompany(scope), ...(opts?.incluirInativos ? {} : { ativo: true }) },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    include: {
      _count: {
        select: {
          ordensResponsavel: { where: { status: { in: ["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_PECAS", "FINALIZADA_NAO_FATURADA"] } } }
        }
      }
    }
  });

  // Nome do usuário vinculado (login), quando houver.
  const usuarioIds = tecnicos.map((t) => t.usuarioId).filter((id): id is string => Boolean(id));
  const usuarios = usuarioIds.length
    ? await prisma.usuario.findMany({ where: { id: { in: usuarioIds } }, select: { id: true, nome: true } })
    : [];
  const nomePorUsuario = new Map(usuarios.map((u) => [u.id, u.nome]));

  return tecnicos.map((t) => ({
    id: t.id,
    nome: t.nome,
    especialidade: t.especialidade,
    telefone: t.telefone,
    custoHora: Number(t.custoHora),
    usuarioId: t.usuarioId,
    usuarioNome: t.usuarioId ? nomePorUsuario.get(t.usuarioId) ?? null : null,
    ativo: t.ativo,
    osAbertas: t._count.ordensResponsavel
  }));
}

/** Usuários da empresa (vínculos ativos) que podem ser ligados a um técnico para login. */
export async function listUsuariosDaEmpresa(scope: TenantScope): Promise<Array<{ id: string; nome: string; email: string }>> {
  const vinculos = await prisma.usuarioVinculo.findMany({
    where: { empresaId: scope.empresaId, ativo: true },
    include: { usuario: { select: { id: true, nome: true, email: true, status: true } } }
  });
  const vistos = new Set<string>();
  const usuarios: Array<{ id: string; nome: string; email: string }> = [];
  for (const v of vinculos) {
    if (v.usuario.status !== "ATIVO" || vistos.has(v.usuario.id)) continue;
    vistos.add(v.usuario.id);
    usuarios.push({ id: v.usuario.id, nome: v.usuario.nome, email: v.usuario.email });
  }
  return usuarios.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

async function resolveUsuarioId(scope: TenantScope, usuarioId: string | null | undefined, tecnicoIdAtual?: string): Promise<string | null> {
  const id = clean(usuarioId) || null;
  if (!id) return null;
  // O usuário precisa ter vínculo ativo com a empresa.
  const vinculo = await prisma.usuarioVinculo.findFirst({ where: { usuarioId: id, empresaId: scope.empresaId, ativo: true }, select: { id: true } });
  if (!vinculo) throw new TecnicoError("O usuário selecionado não tem acesso a esta empresa.");
  // usuarioId é único: um usuário só pode ser um técnico.
  const jaVinculado = await prisma.tecnico.findFirst({ where: { usuarioId: id }, select: { id: true } });
  if (jaVinculado && jaVinculado.id !== tecnicoIdAtual) {
    throw new TecnicoError("Este usuário já está vinculado a outro técnico.");
  }
  return id;
}

export async function createTecnico(scope: TenantScope, input: TecnicoInput, usuarioAcaoId?: string) {
  const nome = clean(input.nome);
  if (!nome) throw new TecnicoError("Informe o nome do técnico.");
  const usuarioId = await resolveUsuarioId(scope, input.usuarioId);

  const tecnico = await prisma.tecnico.create({
    data: {
      ...scopedByTenantCompany(scope),
      nome,
      especialidade: clean(input.especialidade) || null,
      telefone: clean(input.telefone).replace(/\D+/g, "") || null,
      custoHora: Number(input.custoHora ?? 0) || 0,
      usuarioId,
      ativo: input.ativo ?? true
    }
  });
  await prisma.$transaction(async (tx) => createAuditLog(tx, {
    scope, usuarioId: usuarioAcaoId, entidade: "Tecnico", entidadeId: tecnico.id, acao: "CREATE", payload: { nome }
  }));
  return tecnico;
}

export async function updateTecnico(scope: TenantScope, id: string, input: TecnicoInput, usuarioAcaoId?: string) {
  const existente = await prisma.tecnico.findFirst({ where: { id, ...scopedByTenantCompany(scope) } });
  if (!existente) throw new TecnicoError("Técnico não encontrado.");

  const data: Record<string, unknown> = {};
  if (input.nome !== undefined) {
    const nome = clean(input.nome);
    if (!nome) throw new TecnicoError("O nome não pode ficar vazio.");
    data.nome = nome;
  }
  if (input.especialidade !== undefined) data.especialidade = clean(input.especialidade) || null;
  if (input.telefone !== undefined) data.telefone = clean(input.telefone).replace(/\D+/g, "") || null;
  if (input.custoHora !== undefined) data.custoHora = Number(input.custoHora ?? 0) || 0;
  if (input.usuarioId !== undefined) data.usuarioId = await resolveUsuarioId(scope, input.usuarioId, id);
  if (input.ativo !== undefined) data.ativo = input.ativo;

  const tecnico = await prisma.tecnico.update({ where: { id }, data });
  await prisma.$transaction(async (tx) => createAuditLog(tx, {
    scope, usuarioId: usuarioAcaoId, entidade: "Tecnico", entidadeId: id, acao: "UPDATE", payload: { nome: tecnico.nome }
  }));
  return tecnico;
}

export async function archiveTecnico(scope: TenantScope, id: string, usuarioAcaoId?: string) {
  const existente = await prisma.tecnico.findFirst({ where: { id, ...scopedByTenantCompany(scope) } });
  if (!existente) throw new TecnicoError("Técnico não encontrado.");
  const tecnico = await prisma.tecnico.update({ where: { id }, data: { ativo: false } });
  await prisma.$transaction(async (tx) => createAuditLog(tx, {
    scope, usuarioId: usuarioAcaoId, entidade: "Tecnico", entidadeId: id, acao: "ARCHIVE", payload: { nome: tecnico.nome }
  }));
  return tecnico;
}

/** Técnico vinculado ao usuário logado (para auto-atribuir apontamentos). Null se não for técnico. */
export async function tecnicoDoUsuario(scope: TenantScope, usuarioId: string): Promise<{ id: string; nome: string } | null> {
  const t = await prisma.tecnico.findFirst({
    where: { ...scopedByTenantCompany(scope), usuarioId, ativo: true },
    select: { id: true, nome: true }
  });
  return t;
}

import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";

export type ColaboradorSummary = {
  vinculoId: string;
  usuarioId: string;
  nome: string;
  email: string;
  perfilId: string;
  perfilNome: string;
  ativo: boolean;
  criadoEm: string;
};

export type PerfilSummary = {
  id: string;
  nome: string;
  descricao: string | null;
  totalPermissoes: number;
  permissoes: { modulo: string; acao: string }[];
};

export async function listColaboradores(): Promise<ColaboradorSummary[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  try {
    const scope = await getDevelopmentTenantScope();

    const vinculos = await prisma.usuarioVinculo.findMany({
      where: scopedByTenantCompany(scope),
      include: {
        usuario: { select: { id: true, nome: true, email: true } },
        perfil: { select: { id: true, nome: true } }
      },
      orderBy: [{ ativo: "desc" }, { criadoEm: "asc" }]
    });

    return vinculos.map((v) => ({
      vinculoId: v.id,
      usuarioId: v.usuario.id,
      nome: v.usuario.nome,
      email: v.usuario.email,
      perfilId: v.perfil.id,
      perfilNome: v.perfil.nome,
      ativo: v.ativo,
      criadoEm: v.criadoEm.toISOString()
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível carregar colaboradores: ${message}`);
  }
}

export async function listPerfis(): Promise<PerfilSummary[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  try {
    const scope = await getDevelopmentTenantScope();

    const perfis = await prisma.perfil.findMany({
      where: { tenantId: scope.tenantId },
      include: { permissoes: { select: { modulo: true, acao: true } } },
      orderBy: { nome: "asc" }
    });

    return perfis.map((p) => ({
      id: p.id,
      nome: p.nome,
      descricao: p.descricao,
      totalPermissoes: p.permissoes.length,
      permissoes: p.permissoes
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível carregar perfis: ${message}`);
  }
}

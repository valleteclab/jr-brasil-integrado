import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";

/**
 * Resolução da empresa para a LOJA PÚBLICA (multiloja), sem depender da sessão do ERP.
 * Cada empresa tem um `slugLoja` único e é acessada por /loja/{slug}. O cliente final não está
 * logado, então a empresa é resolvida pelo slug da URL — não por getDevelopmentTenantScope.
 */
export type LojaInfo = {
  scope: TenantScope;
  slug: string;
  nome: string;
  logoSistema: string | null;
  corDestaque: string | null;
};

const SELECT = {
  id: true,
  tenantId: true,
  razaoSocial: true,
  nomeFantasia: true,
  logoSistema: true,
  corDestaque: true,
  slugLoja: true
} as const;

function toInfo(empresa: { id: string; tenantId: string; razaoSocial: string; nomeFantasia: string | null; logoSistema: string | null; corDestaque: string | null; slugLoja: string | null }): LojaInfo {
  return {
    scope: { tenantId: empresa.tenantId, empresaId: empresa.id },
    slug: empresa.slugLoja ?? "",
    nome: empresa.nomeFantasia ?? empresa.razaoSocial,
    logoSistema: empresa.logoSistema,
    corDestaque: empresa.corDestaque
  };
}

/**
 * Empresa cuja loja é acessada por {slug}. Retorna null se o slug não existir OU se o módulo
 * Loja Virtual não estiver habilitado pelo dono do SaaS para o cliente (Tenant.lojaHabilitada).
 */
export async function getLojaInfo(slug: string): Promise<LojaInfo | null> {
  const s = (slug ?? "").trim();
  if (!s) return null;
  const empresa = await prisma.empresa.findFirst({
    where: { slugLoja: s, tenant: { lojaHabilitada: true } },
    select: SELECT
  });
  return empresa ? toInfo(empresa) : null;
}

/** Primeira loja publicada (slug definido E módulo habilitado) — usado pela raiz /loja. */
export async function getLojaPadrao(): Promise<LojaInfo | null> {
  const empresa = await prisma.empresa.findFirst({
    where: { slugLoja: { not: null }, tenant: { lojaHabilitada: true } },
    orderBy: { criadoEm: "asc" },
    select: SELECT
  });
  return empresa ? toInfo(empresa) : null;
}

/** Escopo (tenant/empresa) da loja do slug. Lança se o slug não existir. */
export async function getLojaScope(slug: string): Promise<TenantScope> {
  const info = await getLojaInfo(slug);
  if (!info) throw new Error("Loja não encontrada.");
  return info.scope;
}

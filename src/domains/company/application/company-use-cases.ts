import type { SegmentoEmpresa } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import type { TipoNegocio } from "@/lib/auth/modules";

export type EmpresaPerfil = {
  razaoSocial: string;
  nomeFantasia: string | null;
  tipoNegocio: TipoNegocio;
  segmento: SegmentoEmpresa;
};

/**
 * Leitura leve do perfil de operação da empresa (tipo de negócio + segmento).
 * A edição é feita pela tela de Dados da empresa via saveCompanySettings
 * (company-settings.ts) — este é apenas um leitor usado por telas como Produtos
 * (para habilitar a aba de aplicação veicular quando o segmento é AUTOPECAS).
 */
export async function getEmpresaPerfil(scope: TenantScope): Promise<EmpresaPerfil> {
  const empresa = await prisma.empresa.findUnique({
    where: { id: scope.empresaId },
    select: { razaoSocial: true, nomeFantasia: true, tipoNegocio: true, segmento: true }
  });
  return {
    razaoSocial: empresa?.razaoSocial ?? "",
    nomeFantasia: empresa?.nomeFantasia ?? null,
    tipoNegocio: empresa?.tipoNegocio ?? "AMBOS",
    segmento: empresa?.segmento ?? "GERAL"
  };
}

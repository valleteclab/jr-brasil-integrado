import { prisma } from "@/lib/db/prisma";

export type TenantScope = {
  tenantId: string;
  empresaId: string;
};

const DEFAULT_TENANT_SLUG = "jr-brasil";

export async function getDevelopmentTenantScope(): Promise<TenantScope> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: DEFAULT_TENANT_SLUG },
    include: {
      empresas: {
        where: { matriz: true },
        take: 1
      }
    }
  });

  const empresa = tenant?.empresas[0];

  if (!tenant || !empresa) {
    throw new Error("Tenant/empresa de desenvolvimento nao encontrados. Rode a migration e o seed inicial.");
  }

  return {
    tenantId: tenant.id,
    empresaId: empresa.id
  };
}

export function scopedByTenantCompany(scope: TenantScope) {
  return {
    tenantId: scope.tenantId,
    empresaId: scope.empresaId
  };
}

import { prisma } from "@/lib/db/prisma";
import { getDevelopmentTenantScope, type TenantScope } from "@/lib/auth/dev-session";
import { TENANT_FEATURE_FLAGS, allFeaturesEnabled, type TenantFeatureKey, type TenantFeatures } from "@/lib/auth/feature-flags";

/** Erro de módulo não liberado para o tenant (gate do dono do SaaS). */
export class ModuloBloqueadoError extends Error {
  constructor(public readonly flag: TenantFeatureKey) {
    super("Este recurso não está liberado para a sua conta. Fale com o suporte.");
    this.name = "ModuloBloqueadoError";
  }
}

// Select estático com todas as flags (Prisma exige objeto literal; mantém os tipos).
const FLAGS_SELECT = {
  lojaHabilitada: true,
  iaHabilitada: true,
  spedFiscalHabilitado: true,
  expedicaoHabilitada: true,
  pdvTelaCheiaHabilitado: true,
  vendaBalcaoHabilitada: true,
  pedidoFaturadoHabilitado: true,
  ordemServicoHabilitada: true,
  orcamentoHabilitado: true,
  financeiroHabilitado: true,
  fiscalHabilitado: true,
  gastosHabilitado: true,
  cosmosHabilitado: true,
  whatsappHabilitado: true
} as const;

/**
 * Lê todas as flags de módulo do tenant. Ausência/erro → tudo LIGADO (fail-open): preferimos não
 * esconder funcionalidades por uma falha de leitura a deixar o cliente sem acesso indevidamente.
 */
export async function getTenantFeatures(tenantId: string): Promise<TenantFeatures> {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: FLAGS_SELECT });
    if (!tenant) return allFeaturesEnabled();
    const out = {} as TenantFeatures;
    for (const f of TENANT_FEATURE_FLAGS) out[f] = (tenant as Record<string, boolean>)[f] ?? true;
    return out;
  } catch {
    return allFeaturesEnabled();
  }
}

/** Indica se uma flag específica está liberada para o tenant. */
export async function moduloLiberado(scope: TenantScope, flag: TenantFeatureKey): Promise<boolean> {
  const features = await getTenantFeatures(scope.tenantId);
  return features[flag];
}

/** Atalho para páginas (server components): resolve o escopo atual e checa a flag. */
export async function moduloLiberadoNoScope(flag: TenantFeatureKey): Promise<boolean> {
  const scope = await getDevelopmentTenantScope();
  return moduloLiberado(scope, flag);
}

/** Lança ModuloBloqueadoError se a flag estiver desligada (guard de API/use-case). */
export async function assertModuloLiberado(scope: TenantScope, flag: TenantFeatureKey): Promise<void> {
  if (!(await moduloLiberado(scope, flag))) throw new ModuloBloqueadoError(flag);
}

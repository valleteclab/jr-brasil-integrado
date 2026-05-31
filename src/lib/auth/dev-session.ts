import { getSessionScope } from "@/lib/auth/session";

export type TenantScope = {
  tenantId: string;
  empresaId: string;
};

/**
 * Escopo (tenant/empresa) da requisição atual, resolvido a partir da SESSÃO
 * autenticada. Mantém o nome histórico para não quebrar os ~46 call sites; hoje
 * exige login válido (lança se não houver sessão). Rotas/páginas /erp já são
 * protegidas pelo middleware + layout, então aqui só chega requisição autenticada.
 */
export async function getDevelopmentTenantScope(): Promise<TenantScope> {
  return getSessionScope();
}

export function scopedByTenantCompany(scope: TenantScope) {
  return {
    tenantId: scope.tenantId,
    empresaId: scope.empresaId
  };
}

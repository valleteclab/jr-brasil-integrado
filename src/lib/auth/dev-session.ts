import type { AmbienteFiscal } from "@prisma/client";
import { getSessionScope } from "@/lib/auth/session";

export type TenantScope = {
  tenantId: string;
  empresaId: string;
  /**
   * Ambiente fiscal vigente da empresa (HOMOLOGACAO/PRODUCAO). Preenchido por
   * getSessionScope a partir da ConfiguracaoFiscal. Usado para isolar dados de teste
   * (homologação) dos de produção nas listagens. Ausente em escopos montados à mão
   * (scripts/seed) — nesses casos vale o padrão HOMOLOGACAO.
   */
  ambiente?: AmbienteFiscal;
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

/**
 * Escopo (tenant/empresa) + filtro pelo AMBIENTE fiscal vigente da empresa.
 * Use em listagens/agregações de documentos que têm coluna `ambiente`
 * (notas, vendas, orçamentos, financeiro, caixa, OS, entradas): assim os dados
 * de homologação não aparecem quando a empresa está em produção e vice-versa.
 */
export function scopedByTenantCompanyAmbiente(scope: TenantScope) {
  return {
    tenantId: scope.tenantId,
    empresaId: scope.empresaId,
    ambiente: scope.ambiente ?? ("HOMOLOGACAO" as AmbienteFiscal)
  };
}

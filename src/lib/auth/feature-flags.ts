/**
 * Catálogo de FLAGS POR TENANT liberadas pelo dono do SaaS (painel /admin) — fonte única de verdade.
 *
 * Este arquivo é PURO (sem prisma) para poder ser importado também por componentes client
 * (ex.: ErpShell). A leitura no banco e os asserts de servidor ficam em `tenant-features.ts`.
 */

/** Todas as colunas booleanas de habilitação por tenant (model Tenant). */
export const TENANT_FEATURE_FLAGS = [
  "lojaHabilitada",
  "iaHabilitada",
  "spedFiscalHabilitado",
  "expedicaoHabilitada",
  "pdvTelaCheiaHabilitado",
  "vendaBalcaoHabilitada",
  "pedidoFaturadoHabilitado",
  "ordemServicoHabilitada",
  "orcamentoHabilitado",
  "financeiroHabilitado",
  "fiscalHabilitado",
  "gastosHabilitado",
  "cosmosHabilitado",
  "whatsappHabilitado"
] as const;

export type TenantFeatureKey = (typeof TENANT_FEATURE_FLAGS)[number];
export type TenantFeatures = Record<TenantFeatureKey, boolean>;

/** href do item de menu → flag que o controla (esconde o item e bloqueia a URL quando off). */
export const HREF_FLAG: Record<string, TenantFeatureKey> = {
  "/pdv": "pdvTelaCheiaHabilitado",
  "/erp/os": "ordemServicoHabilitada",
  "/erp/orcamentos": "orcamentoHabilitado",
  "/erp/financeiro": "financeiroHabilitado",
  "/erp/fiscal": "fiscalHabilitado",
  "/erp/gastos": "gastosHabilitado",
  "/erp/configuracoes/cosmos": "cosmosHabilitado",
  "/erp/configuracoes/ia": "iaHabilitada",
  "/erp/assistente": "iaHabilitada",
  "/erp/configuracoes/whatsapp": "whatsappHabilitado",
  // Dobra os dois gates que já existiam (antes tratados por flags soltas no ErpShell).
  "/erp/sped-fiscal": "spedFiscalHabilitado",
  "/erp/expedicao": "expedicaoHabilitada"
};

/** Tipo de atendimento (venda) → flag que o libera no seletor de /erp/atendimento. */
export const TIPO_VENDA_FLAG = {
  VENDA_BALCAO: "vendaBalcaoHabilitada",
  PEDIDO_FATURADO: "pedidoFaturadoHabilitado",
  OS: "ordemServicoHabilitada",
  ORCAMENTO: "orcamentoHabilitado"
} as const satisfies Record<string, TenantFeatureKey>;

export type TipoVenda = keyof typeof TIPO_VENDA_FLAG;

/** Resolve a flag de um href de menu (null quando o item não é gated por tenant). */
export function flagDoHref(href: string): TenantFeatureKey | null {
  return HREF_FLAG[href] ?? null;
}

/** Objeto de features com tudo ligado — usado como fallback seguro (não esconde nada). */
export function allFeaturesEnabled(): TenantFeatures {
  return Object.fromEntries(TENANT_FEATURE_FLAGS.map((f) => [f, true])) as TenantFeatures;
}

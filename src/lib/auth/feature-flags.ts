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

// ─── Planos comerciais ────────────────────────────────────────────────────────

/** Planos do SaaS. EMISSOR = "Emissor de Notas" (NF-e/NFS-e + clientes/produtos) p/ MEI e Simples. */
export type TenantPlano = "COMPLETO" | "EMISSOR";

/**
 * Preset de flags aplicado ao colocar um cliente no plano EMISSOR: liga só o fiscal; o resto
 * desliga. O upgrade para COMPLETO religa os módulos de série (loja/SPED/expedição continuam
 * opt-in do dono, como sempre foram).
 */
export const PRESET_FLAGS_EMISSOR: TenantFeatures = {
  lojaHabilitada: false,
  iaHabilitada: false,
  spedFiscalHabilitado: false,
  expedicaoHabilitada: false,
  pdvTelaCheiaHabilitado: false,
  vendaBalcaoHabilitada: false,
  pedidoFaturadoHabilitado: false,
  ordemServicoHabilitada: false,
  orcamentoHabilitado: false,
  financeiroHabilitado: false,
  fiscalHabilitado: true,
  gastosHabilitado: false,
  cosmosHabilitado: false,
  whatsappHabilitado: false
};

/** Preset do plano COMPLETO (padrões de novo cliente: módulos de série ligados; loja/SPED/expedição opt-in). */
export const PRESET_FLAGS_COMPLETO: TenantFeatures = {
  ...allFeaturesEnabled(),
  lojaHabilitada: false,
  spedFiscalHabilitado: false,
  expedicaoHabilitada: false
};

/**
 * Rotas permitidas no plano EMISSOR (whitelist por prefixo, aplicada ALÉM dos gates de flag/RBAC).
 * Foco: emitir NF-e/NFS-e, acompanhar o Simples/MEI e manter cadastros mínimos.
 */
export const EMISSOR_ROUTE_PREFIXES = ["/erp/fiscal", "/erp/nfse-recebidas", "/erp/clientes", "/erp/produtos", "/erp/configuracoes", "/erp/colaboradores", "/erp/conta"] as const;

/** Um pathname do ERP é acessível no plano EMISSOR? ("/erp" exato = dashboard sempre pode). */
export function rotaPermitidaNoEmissor(pathname: string): boolean {
  if (pathname === "/erp" || pathname === "/erp/") return true;
  return EMISSOR_ROUTE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

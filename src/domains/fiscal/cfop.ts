/**
 * Derivação automática de CFOP para operações de saída (venda).
 *
 * O CFOP depende da operação (aqui: venda), de a operação ser interna (mesma UF, prefixo 5)
 * ou interestadual (prefixo 6) e de a mercadoria estar sujeita a substituição tributária.
 * Cobre o caso predominante de revenda de mercadoria adquirida de terceiros. CFOP definido
 * manualmente no produto sempre prevalece sobre a derivação.
 */

export type CfopVendaContext = {
  ufOrigem: string | null;
  ufDestino: string | null;
  /** Mercadoria sujeita a ST já recolhida (contribuinte substituído). */
  substituicaoTributaria?: boolean;
  /** Produção do próprio estabelecimento (industrialização). Padrão: revenda. */
  producaoPropria?: boolean;
};

/** Retorna o CFOP de venda derivado do contexto. */
export function resolveCfopVenda(ctx: CfopVendaContext): string {
  const origem = ctx.ufOrigem?.trim().toUpperCase();
  const destino = ctx.ufDestino?.trim().toUpperCase();
  // Sem UF de destino, assume operação interna (consumidor final/balcão).
  const interestadual = Boolean(origem && destino && origem !== destino);
  const prefixo = interestadual ? "6" : "5";

  if (ctx.substituicaoTributaria) {
    // Revenda de mercadoria sujeita a ST: 5405 (interna) / 6404 (interestadual);
    // produção própria com ST: 5401 / 6401.
    if (ctx.producaoPropria) return interestadual ? "6401" : "5401";
    return interestadual ? "6404" : "5405";
  }

  // Venda tributada normalmente: produção própria 5101/6101; revenda 5102/6102.
  const sufixo = ctx.producaoPropria ? "101" : "102";
  return `${prefixo}${sufixo}`;
}

/**
 * CFOP de devolução de venda, emitida pelo próprio vendedor como entrada (tpNF=0).
 * Espelha `resolveCfopVenda`: revenda de mercadoria de terceiros é o caso predominante.
 *  - Sem ST: 1202 (interna) / 2202 (interestadual)
 *  - Produção própria: 1201 / 2201
 *  - Com ST (revenda): 1411 / 2411; produção própria com ST: 1410 / 2410
 */
export function resolveCfopDevolucao(ctx: CfopVendaContext): string {
  const origem = ctx.ufOrigem?.trim().toUpperCase();
  const destino = ctx.ufDestino?.trim().toUpperCase();
  const interestadual = Boolean(origem && destino && origem !== destino);
  const prefixo = interestadual ? "2" : "1";

  if (ctx.substituicaoTributaria) {
    if (ctx.producaoPropria) return interestadual ? "2410" : "1410";
    return interestadual ? "2411" : "1411";
  }

  const sufixo = ctx.producaoPropria ? "201" : "202";
  return `${prefixo}${sufixo}`;
}

/** Indica se os tributos calculados caracterizam substituição tributária de ICMS. */
export function isSubstituicaoTributaria(taxes: { csosn: string | null; cstIcms: string | null }): boolean {
  if (taxes.csosn && ["201", "202", "203", "500"].includes(taxes.csosn)) return true;
  if (taxes.cstIcms && ["10", "30", "60", "70"].includes(taxes.cstIcms)) return true;
  return false;
}

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
  /** O remetente RETÉM o ICMS-ST NESTA operação (contribuinte substituto — vICMSST > 0). */
  substituto?: boolean;
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
    // Produção própria com ST (substituto industrial): 5401 / 6401.
    if (ctx.producaoPropria) return interestadual ? "6401" : "5401";
    // Revenda na condição de SUBSTITUTO (retém o ST nesta operação — ex.: venda interestadual
    // com protocolo, Conv. 142/2018): 5403 / 6403.
    if (ctx.substituto) return interestadual ? "6403" : "5403";
    // Revenda na condição de SUBSTITUÍDO (imposto retido anteriormente): 5405 / 6404.
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

/**
 * CFOPs que caracterizam substituição tributária de ICMS. Na importação de NF-e de entrada o
 * XML traz o CFOP do fornecedor (saída, ex. 5403/5405 = revenda de mercadoria com ST), então o
 * CFOP é um sinal de ST tão confiável quanto o CST/CSOSN — e às vezes o único, quando o CST do
 * XML vem fora do padrão. Inclui CFOPs de saída (5/6) e de entrada (1/2) relacionados a ST.
 */
const CFOPS_ST = new Set([
  // Saída — substituto/substituído (venda, transferência, devolução)
  "5401", "5402", "5403", "5405", "5409", "5410", "5411", "5412", "5413", "5414", "5415",
  "6401", "6402", "6403", "6404", "6409", "6410", "6411", "6412", "6413", "6414", "6415",
  // Entrada — aquisição/retorno/devolução com ST
  "1401", "1403", "1406", "1408", "1409", "1410", "1411", "1414", "1415",
  "2401", "2403", "2406", "2408", "2409", "2410", "2411", "2414", "2415"
]);

/** Indica se o CFOP caracteriza operação com substituição tributária de ICMS. */
export function cfopIndicaSt(cfop: string | null | undefined): boolean {
  const c = (cfop ?? "").replace(/\D/g, "");
  return c.length === 4 && CFOPS_ST.has(c);
}

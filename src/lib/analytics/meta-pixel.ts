/**
 * Meta Pixel — medição das campanhas de aquisição (Instagram/Facebook Ads).
 *
 * Sem um evento de conversão chegando à Meta, o algoritmo só sabe quem CLICA e passa a
 * otimizar para o clique mais barato (foi o que aconteceu na 1ª campanha: metade da verba
 * foi parar na Audience Network). Com `Lead` e `CompleteRegistration` o leilão passa a
 * procurar quem se cadastra.
 *
 * O ID do pixel NUNCA fica no código: vem de `META_PIXEL_ID`, lido no servidor e repassado
 * ao componente. Sem a variável, nada é carregado e o site segue igual.
 */

/** Eventos padrão da Meta que o funil de aquisição usa. */
export type EventoPixel = "Lead" | "CompleteRegistration" | "Contact" | "ViewContent";

type Fbq = ((comando: "track" | "trackCustom" | "init" | "consent", evento: string, dados?: Record<string, unknown>) => void) & {
  queue?: unknown[];
};

declare global {
  interface Window {
    fbq?: Fbq;
  }
}

/**
 * Dispara um evento no pixel. É um no-op silencioso quando o pixel não está configurado
 * (desenvolvimento, homologação) ou quando um bloqueador de anúncios impediu o carregamento —
 * medição nunca pode derrubar o fluxo de cadastro do cliente.
 */
export function rastrearEvento(evento: EventoPixel, dados?: Record<string, unknown>): void {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  try {
    window.fbq("track", evento, dados);
  } catch {
    // Medição é acessório: engolir o erro é intencional.
  }
}

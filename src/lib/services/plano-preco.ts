/**
 * PREÇO VIGENTE DO PLANO.
 *
 * Um só lugar decide quanto o plano custa HOJE: se há preço promocional válido, é ele que vale —
 * na página de venda, no cadastro e na assinatura cobrada. O preço cheio fica como o "de" riscado.
 * Centralizado de propósito: preço divergente entre a landing e a cobrança é quebra de confiança.
 */

export type PlanoPrecoEntrada = {
  precoMensal: unknown;
  precoPromocional?: unknown;
  promocaoRotulo?: string | null;
  promocaoAte?: Date | string | null;
};

export type PlanoPreco = {
  /** Valor que será cobrado. */
  preco: number;
  /** Preço cheio, só quando há promoção vigente (para exibir riscado). */
  precoDe: number | null;
  rotulo: string | null;
  /** Fim da promoção, quando tem prazo. */
  ate: string | null;
};

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function precoDoPlano(plano: PlanoPrecoEntrada | null | undefined): PlanoPreco {
  const cheio = num(plano?.precoMensal);
  const promo = num(plano?.precoPromocional);
  const ate = plano?.promocaoAte ? new Date(plano.promocaoAte) : null;
  const venceu = ate != null && !Number.isNaN(ate.getTime()) && ate.getTime() < Date.now();

  if (promo > 0 && promo < cheio && !venceu) {
    return {
      preco: promo,
      precoDe: cheio,
      rotulo: plano?.promocaoRotulo?.trim() || null,
      ate: ate && !Number.isNaN(ate.getTime()) ? ate.toISOString() : null
    };
  }
  return { preco: cheio, precoDe: null, rotulo: null, ate: null };
}

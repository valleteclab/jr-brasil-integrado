import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { decryptSecret } from "@/lib/security/secret-crypto";
import { conectarContaMp } from "@/domains/finance/providers/mercadopago-oauth";

export const dynamic = "force-dynamic";

const VOLTAR = "/erp/configuracoes/contas-financeiras";

/**
 * Callback do OAuth Mercado Pago: valida o state (conta+tenant criptografados, expira em 15 min),
 * troca o code pelos tokens e grava na ContaBancaria. Redireciona de volta às contas financeiras.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const voltar = (msg: string, ok: boolean) =>
    NextResponse.redirect(new URL(`${VOLTAR}?mp=${ok ? "ok" : "erro"}&msg=${encodeURIComponent(msg)}`, url.origin));

  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();

    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state");
    if (!code || !stateRaw) return voltar("Autorização cancelada no Mercado Pago.", false);

    let state: { c?: string; t?: string; e?: string; x?: number };
    try {
      state = JSON.parse(decryptSecret(stateRaw)) as typeof state;
    } catch {
      return voltar("Retorno inválido do Mercado Pago — tente conectar de novo.", false);
    }
    if (!state.c || !state.x || state.x < Date.now()) {
      return voltar("A autorização expirou — tente conectar de novo.", false);
    }
    // O usuário logado precisa ser do MESMO tenant/empresa que iniciou a conexão.
    if (state.t !== scope.tenantId || state.e !== scope.empresaId) {
      return voltar("Sessão diferente da que iniciou a conexão — entre na empresa correta e repita.", false);
    }
    const conta = await prisma.contaBancaria.findFirst({ where: { id: state.c, ...scopedByTenantCompany(scope) } });
    if (!conta) return voltar("Conta bancária não encontrada.", false);

    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || "";
    const redirectUri = `${proto}://${host}/api/erp/mercadopago/callback`;

    const r = await conectarContaMp(conta.id, code, redirectUri);
    return voltar(`Conta Mercado Pago conectada${r.userId ? ` (usuário ${r.userId})` : ""}! Pix e boleto liberados.`, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao conectar a conta Mercado Pago.";
    return voltar(message, false);
  }
}

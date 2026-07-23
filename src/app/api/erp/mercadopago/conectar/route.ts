import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { encryptSecret } from "@/lib/security/secret-crypto";
import { getMpAppCreds, montarUrlAutorizacao } from "@/domains/finance/providers/mercadopago-oauth";

export const dynamic = "force-dynamic";

/**
 * Inicia a conexão OAuth da conta Mercado Pago (?conta=<contaBancariaId>): redireciona o usuário
 * para autorizar no MP. O state carrega conta+tenant criptografados (validado no callback).
 */
export async function GET(request: Request) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const url = new URL(request.url);
    const contaId = url.searchParams.get("conta") ?? "";

    const conta = await prisma.contaBancaria.findFirst({ where: { id: contaId, ...scopedByTenantCompany(scope) } });
    if (!conta) return NextResponse.json({ error: "Conta bancária não encontrada." }, { status: 404 });

    const creds = await getMpAppCreds();
    if (!creds) {
      return NextResponse.json({ error: "A integração Mercado Pago ainda não foi habilitada pela plataforma — fale com o suporte." }, { status: 400 });
    }

    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || "";
    const redirectUri = `${proto}://${host}/api/erp/mercadopago/callback`;

    const state = encryptSecret(JSON.stringify({
      c: conta.id,
      t: scope.tenantId,
      e: scope.empresaId,
      x: Date.now() + 15 * 60000 // válido por 15 min
    }));

    return NextResponse.redirect(montarUrlAutorizacao(creds, redirectUri, state));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao iniciar a conexão com o Mercado Pago.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

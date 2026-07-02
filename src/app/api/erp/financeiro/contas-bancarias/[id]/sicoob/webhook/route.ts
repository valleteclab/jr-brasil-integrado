import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { BoletoError, ativarWebhookCobranca, statusWebhookCobranca } from "@/domains/finance/application/boleto-use-cases";

/** Ativa o webhook de liquidação da cobrança Sicoob desta conta (baixa em tempo real). */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const r = await ativarWebhookCobranca(scope, params.id, session?.usuarioId);
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao ativar o webhook.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof BoletoError ? 400 : 500) });
  }
}

/** Situação do webhook desta conta no Sicoob. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const r = await statusWebhookCobranca(scope, params.id);
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao consultar o webhook.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof BoletoError ? 400 : 500) });
  }
}

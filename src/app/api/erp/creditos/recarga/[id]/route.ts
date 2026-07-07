import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { CreditoError, sincronizarRecarga } from "@/domains/credito/application/carteira-use-cases";

/** Verifica no Asaas se a recarga foi paga e credita a carteira (fallback do webhook). */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const r = await sincronizarRecarga(scope, params.id);
    return NextResponse.json(r);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro ao verificar a recarga.";
    return NextResponse.json({ error: msg }, { status: authErrorStatus(error, error instanceof CreditoError ? 400 : 500) });
  }
}

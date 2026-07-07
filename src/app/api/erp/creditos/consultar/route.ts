import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { CreditoError } from "@/domains/credito/application/carteira-use-cases";
import { consultarCredito } from "@/domains/credito/application/consulta-credito-use-cases";

/** Consulta de crédito (DEBITA a carteira). Body: { documento, clienteId?, forcar? }. */
export async function POST(request: Request) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as { documento: string; clienteId?: string | null; forcar?: boolean };
    const r = await consultarCredito(scope, { documento: body.documento, clienteId: body.clienteId ?? null, forcar: body.forcar }, session?.usuarioId);
    return NextResponse.json(r);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro na consulta de crédito.";
    return NextResponse.json({ error: msg }, { status: authErrorStatus(error, error instanceof CreditoError ? 400 : 500) });
  }
}

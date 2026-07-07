import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { CreditoError, criarRecarga } from "@/domains/credito/application/carteira-use-cases";

/** Cria uma recarga da carteira via Pix (Asaas) e devolve o QR. Body: { valor }. */
export async function POST(request: Request) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as { valor: number };
    const r = await criarRecarga(scope, { valor: Number(body.valor) }, session?.usuarioId);
    return NextResponse.json(r);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro ao criar a recarga.";
    return NextResponse.json({ error: msg }, { status: authErrorStatus(error, error instanceof CreditoError ? 400 : 500) });
  }
}

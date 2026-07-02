import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { BoletoError, prorrogarBoletoNoBanco } from "@/domains/finance/application/boleto-use-cases";

/** Prorroga o vencimento do boleto no banco (e do título no ERP). Body: { vencimento: "YYYY-MM-DD" }. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as { vencimento?: string };
    if (!body.vencimento) throw new BoletoError("Informe o novo vencimento.");
    const r = await prorrogarBoletoNoBanco(scope, params.id, new Date(`${body.vencimento}T12:00:00`), session?.usuarioId);
    return NextResponse.json({ vencimento: r.vencimento.toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao prorrogar o boleto.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof BoletoError ? 400 : 500) });
  }
}

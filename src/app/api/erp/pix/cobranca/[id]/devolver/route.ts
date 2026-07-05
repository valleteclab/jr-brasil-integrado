import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { PixError, devolverPixAvulso } from "@/domains/finance/application/pix-use-cases";

/**
 * DEVOLVE ao pagador um Pix pago no caixa/PDV (cliente pagou o QR e desistiu da venda).
 * BACEN: a devolução cai na conta do pagador em segundos.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("vendas");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const r = await devolverPixAvulso(scope, params.id, session?.usuarioId);
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao devolver o Pix.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof PixError ? 400 : 500) });
  }
}

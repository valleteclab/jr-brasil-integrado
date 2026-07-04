import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { renovarQuote } from "@/domains/sales-quote/application/quote-use-cases";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("orcamentos");
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json().catch(() => ({}))) as { validadeDias?: number };
    const result = await renovarQuote(scope, params.id, body.validadeDias ?? 7);
    return NextResponse.json({ id: result.id, status: result.status, validoAte: result.validoAte });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao renovar orçamento.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

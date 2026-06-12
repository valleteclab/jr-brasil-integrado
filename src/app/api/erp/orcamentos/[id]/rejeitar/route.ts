import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { rejectQuote } from "@/domains/sales-quote/application/quote-use-cases";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("orcamentos");
    const scope = await getDevelopmentTenantScope();
    const result = await rejectQuote(scope, params.id);
    return NextResponse.json({ id: result.id, status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao rejeitar orçamento.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

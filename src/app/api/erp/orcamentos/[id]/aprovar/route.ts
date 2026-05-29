import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { approveQuote } from "@/domains/sales-quote/application/quote-use-cases";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const scope = await getDevelopmentTenantScope();
    const result = await approveQuote(scope, params.id);
    return NextResponse.json({ id: result.id, status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao aprovar orçamento.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

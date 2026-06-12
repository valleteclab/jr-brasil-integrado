import { NextResponse } from "next/server";
import { processFiscalEntry } from "@/domains/products/application/fiscal-entry-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("entradas-fiscais");
    const scope = await getDevelopmentTenantScope();
    const body = await request.json().catch(() => ({}));
    const result = await processFiscalEntry(scope, params.id, {
      installments: Array.isArray(body.installments) ? body.installments : undefined
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível processar a entrada fiscal.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

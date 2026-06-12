import { NextResponse } from "next/server";
import { reverseFiscalEntry } from "@/domains/products/application/fiscal-entry-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(request: Request, context: RouteContext) {
  try {
    await requireModulo("entradas-fiscais");
    const scope = await getDevelopmentTenantScope();
    const body = await request.json().catch(() => ({}));
    const result = await reverseFiscalEntry(scope, context.params.id, typeof body.motivo === "string" ? body.motivo : undefined);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível estornar a entrada fiscal.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

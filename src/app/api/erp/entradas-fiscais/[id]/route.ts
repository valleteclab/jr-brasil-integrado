import { NextResponse } from "next/server";
import { deleteFiscalEntry, getFiscalEntryDraft } from "@/domains/products/application/fiscal-entry-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireModulo("entradas-fiscais");
    const scope = await getDevelopmentTenantScope();
    const draft = await getFiscalEntryDraft(scope, context.params.id);

    return NextResponse.json(draft);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível carregar a entrada fiscal.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 404) });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireModulo("entradas-fiscais");
    const scope = await getDevelopmentTenantScope();
    const result = await deleteFiscalEntry(scope, context.params.id);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível excluir a entrada fiscal.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

import { NextResponse } from "next/server";
import { createManualFiscalEntry, type ManualFiscalEntryInput } from "@/domains/products/application/fiscal-entry-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";

export async function POST(request: Request) {
  try {
    await requireModulo("entradas-fiscais");
    const body = (await request.json()) as ManualFiscalEntryInput;
    const scope = await getDevelopmentTenantScope();
    const result = await createManualFiscalEntry(scope, body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível lançar a nota de entrada manual.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

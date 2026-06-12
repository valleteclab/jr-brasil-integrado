import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { cancelNotaFiscal } from "@/domains/fiscal/application/fiscal-emission-use-cases";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as { justificativa?: string };
    const result = await cancelNotaFiscal(scope, params.id, body.justificativa ?? "");
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao cancelar nota fiscal.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

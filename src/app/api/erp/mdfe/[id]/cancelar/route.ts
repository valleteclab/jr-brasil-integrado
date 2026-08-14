import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/auth/session";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { authErrorStatus } from "@/lib/auth/http";
import { cancelarMdfe } from "@/domains/fiscal/application/mdfe-use-cases";

export const maxDuration = 120;

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as { justificativa?: string };
    const r = await cancelarMdfe(scope, params.id, body.justificativa ?? "");
    return NextResponse.json(r, { status: r.ok ? 200 : 422 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao cancelar MDF-e.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

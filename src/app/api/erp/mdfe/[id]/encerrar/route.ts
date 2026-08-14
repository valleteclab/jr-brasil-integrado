import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/auth/session";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { authErrorStatus } from "@/lib/auth/http";
import { encerrarMdfe } from "@/domains/fiscal/application/mdfe-use-cases";

export const maxDuration = 120;

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json().catch(() => ({}))) as { municipioIbge?: string; uf?: string };
    const r = await encerrarMdfe(scope, params.id, body);
    return NextResponse.json(r, { status: r.ok ? 200 : 422 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao encerrar MDF-e.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

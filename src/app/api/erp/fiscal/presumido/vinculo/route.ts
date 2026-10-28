import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { PresumidoError } from "@/domains/fiscal/presumido/apuracao-presumido-use-cases";
import { vincularNotaObra } from "@/domains/fiscal/presumido/obras-use-cases";

/** Vincula uma nota (medição) a um contrato de obra — ou desvincula com obraId null. */
export async function POST(request: Request) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as { notaId?: string; obraId?: string | null };
    if (!body.notaId) throw new PresumidoError("Informe a nota.");
    const r = await vincularNotaObra(scope, { notaId: body.notaId, obraId: body.obraId ?? null }, session?.usuarioId);
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao vincular a nota ao contrato.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof PresumidoError ? 400 : 500) });
  }
}

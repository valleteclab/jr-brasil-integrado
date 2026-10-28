import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { PresumidoError } from "@/domains/fiscal/presumido/apuracao-presumido-use-cases";
import { salvarRegimeReceita } from "@/domains/fiscal/presumido/obras-use-cases";

/** Regime de reconhecimento da receita: caixa (recebimento) ou competência (emissão). */
export async function POST(request: Request) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as { regimeReceitaCaixa?: boolean };
    const r = await salvarRegimeReceita(scope, Boolean(body.regimeReceitaCaixa), session?.usuarioId);
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar o regime de receita.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof PresumidoError ? 400 : 500) });
  }
}

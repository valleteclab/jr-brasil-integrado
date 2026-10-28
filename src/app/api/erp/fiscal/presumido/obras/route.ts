import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { PresumidoError } from "@/domains/fiscal/presumido/apuracao-presumido-use-cases";
import { listarObras, salvarObra } from "@/domains/fiscal/presumido/obras-use-cases";

/** Contratos de obra da empresa (definem a modalidade da empreitada). */
export async function GET() {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    return NextResponse.json({ obras: await listarObras(scope) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar os contratos de obra.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 500) });
  }
}

/** Cria ou atualiza um contrato de obra. */
export async function POST(request: Request) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as Record<string, unknown>;
    const obra = await salvarObra(scope, body, session?.usuarioId);
    return NextResponse.json({ obra });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar o contrato de obra.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof PresumidoError ? 400 : 500) });
  }
}

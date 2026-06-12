import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { createCartaCorrecao } from "@/domains/fiscal/application/fiscal-emission-use-cases";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as { correcao?: string };
    const result = await createCartaCorrecao(scope, params.id, body.correcao ?? "");
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao registrar carta de correção.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

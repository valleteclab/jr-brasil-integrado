import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo, SessionError, ForbiddenError } from "@/lib/auth/session";
import { marcarEnviadoContador, SpedError } from "@/domains/fiscal/application/sped-use-cases";

// Marca o arquivo como enviado ao contador (controle do fechamento mensal).
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireModulo("sped-fiscal");
    const scope = await getDevelopmentTenantScope();
    const r = await marcarEnviadoContador(scope, params.id, session.usuarioId);
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar o arquivo SPED.";
    if (error instanceof SessionError) return NextResponse.json({ error: message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: message }, { status: 403 });
    if (error instanceof SpedError) return NextResponse.json({ error: message }, { status: 400 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

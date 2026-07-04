import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { TecnicoError, createTecnico, listTecnicos } from "@/domains/service-order/application/tecnico-use-cases";

export async function GET() {
  try {
    await requireModulo("tecnicos");
    const scope = await getDevelopmentTenantScope();
    const tecnicos = await listTecnicos(scope, { incluirInativos: true });
    return NextResponse.json({ tecnicos });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar técnicos.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    await requireModulo("tecnicos");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const t = await createTecnico(scope, await request.json(), session?.usuarioId);
    return NextResponse.json({ id: t.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar técnico.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof TecnicoError ? 400 : 500) });
  }
}

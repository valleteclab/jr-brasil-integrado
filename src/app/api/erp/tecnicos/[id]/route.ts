import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { TecnicoError, archiveTecnico, updateTecnico } from "@/domains/service-order/application/tecnico-use-cases";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("tecnicos");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const t = await updateTecnico(scope, params.id, await request.json(), session?.usuarioId);
    return NextResponse.json({ id: t.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar técnico.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof TecnicoError ? 400 : 500) });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("tecnicos");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    await archiveTecnico(scope, params.id, session?.usuarioId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao inativar técnico.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof TecnicoError ? 400 : 500) });
  }
}

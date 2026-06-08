import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireAdmin, SessionError, ForbiddenError } from "@/lib/auth/session";
import { updateGasto, deleteGasto } from "@/domains/expenses/application/gasto-use-cases";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = await request.json();
    const result = await updateGasto(scope, params.id, body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar gasto.";
    return NextResponse.json({ error: message }, { status: message.includes("não encontrado") ? 400 : 500 });
  }
}

// EXCLUIR gasto — restrito a perfil ADMIN.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const removido = await deleteGasto(scope, params.id);
    return NextResponse.json({ id: removido.id, ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir gasto.";
    if (error instanceof SessionError) return NextResponse.json({ error: message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: message }, { status: 403 });
    return NextResponse.json({ error: message }, { status: message.includes("não encontrado") ? 400 : 500 });
  }
}

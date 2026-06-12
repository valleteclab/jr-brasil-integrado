import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireAdmin, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { updateGasto, deleteGasto } from "@/domains/expenses/application/gasto-use-cases";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("gastos");
    const scope = await getDevelopmentTenantScope();
    const body = await request.json();
    const result = await updateGasto(scope, params.id, body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar gasto.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, message.includes("não encontrado") ? 400 : 500) });
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
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, message.includes("não encontrado") ? 400 : 500) });
  }
}

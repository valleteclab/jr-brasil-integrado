import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireAdmin, SessionError, ForbiddenError } from "@/lib/auth/session";
import { deletePayable } from "@/domains/finance/application/finance-use-cases";

// EXCLUIR conta a pagar (sem pagamento) — restrito a perfil ADMIN (gate de servidor).
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const conta = await deletePayable(scope, params.id);
    return NextResponse.json({ id: conta.id, ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir conta a pagar.";
    if (error instanceof SessionError) return NextResponse.json({ error: message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: message }, { status: 403 });
    const isValidation = message.includes("não encontrada") || message.includes("Não é possível");
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 });
  }
}

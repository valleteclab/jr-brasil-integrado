import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireAdmin, SessionError, ForbiddenError } from "@/lib/auth/session";
import { deleteNotaFiscal } from "@/domains/fiscal/application/fiscal-emission-use-cases";

// EXCLUIR nota fiscal sem validade fiscal (rascunho/erro/rejeitada/denegada) — restrito a ADMIN.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const nota = await deleteNotaFiscal(scope, params.id);
    return NextResponse.json({ id: nota.id, ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir nota fiscal.";
    if (error instanceof SessionError) return NextResponse.json({ error: message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: message }, { status: 403 });
    const isValidation = message.includes("não encontrada") || message.includes("Só é possível");
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 });
  }
}

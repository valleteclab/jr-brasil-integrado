import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireAdmin } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
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
    const isValidation = message.includes("não encontrada") || message.includes("Só é possível");
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, isValidation ? 400 : 500) });
  }
}

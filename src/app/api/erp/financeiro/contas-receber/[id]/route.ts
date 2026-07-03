import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireAdmin } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { deleteReceivable } from "@/domains/finance/application/finance-use-cases";

// EXCLUIR conta a receber (sem recebimento e sem boleto ativo) — restrito a ADMIN.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const conta = await deleteReceivable(scope, params.id);
    return NextResponse.json({ id: conta.id, ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir conta a receber.";
    const isValidation = message.includes("não encontrada") || message.includes("Não é possível");
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, isValidation ? 400 : 500) });
  }
}

import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireAdmin } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { deleteQuote } from "@/domains/sales-quote/application/quote-use-cases";

// EXCLUIR orçamento — restrito a perfil ADMIN (gate de servidor).
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const orc = await deleteQuote(scope, params.id);
    return NextResponse.json({ id: orc.id, ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir orçamento.";
    const isValidation = message.includes("não encontrado") || message.includes("Não é possível");
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, isValidation ? 400 : 500) });
  }
}

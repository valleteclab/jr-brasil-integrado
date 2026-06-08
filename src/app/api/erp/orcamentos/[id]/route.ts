import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireAdmin, SessionError, ForbiddenError } from "@/lib/auth/session";
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
    if (error instanceof SessionError) return NextResponse.json({ error: message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: message }, { status: 403 });
    const isValidation = message.includes("não encontrado") || message.includes("Não é possível");
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 });
  }
}

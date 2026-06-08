import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireAdmin, SessionError, ForbiddenError } from "@/lib/auth/session";
import { deleteSale } from "@/domains/sales/application/sale-use-cases";

// EXCLUIR pedido de venda — restrito a perfil ADMIN (gate de servidor).
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const pedido = await deleteSale(scope, params.id);
    return NextResponse.json({ id: pedido.id, ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir venda.";
    if (error instanceof SessionError) return NextResponse.json({ error: message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: message }, { status: 403 });
    const isValidation =
      message.includes("não encontrado") || message.includes("Só é possível") || message.includes("nota fiscal");
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 });
  }
}

import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireAdmin, SessionError, ForbiddenError } from "@/lib/auth/session";
import { updateVendedor } from "@/domains/sales/application/comissao-use-cases";

// Atualiza vendedor (nome, percentual, ativo) — restrito a ADMIN.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const body = await request.json();
    const vendedor = await updateVendedor(scope, params.id, body);
    return NextResponse.json({ id: vendedor.id, ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar vendedor.";
    if (error instanceof SessionError) return NextResponse.json({ error: message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: message }, { status: 403 });
    const isValidation =
      message.includes("não encontrado") || message.includes("Informe") || message.includes("Percentual");
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 });
  }
}

import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireAdmin } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { pagarComissao } from "@/domains/sales/application/comissao-use-cases";

// Marca a comissão como paga (acerto feito por fora) — restrito a ADMIN.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const comissao = await pagarComissao(scope, params.id);
    return NextResponse.json({ id: comissao.id, status: comissao.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao pagar comissão.";
    const isValidation = message.includes("não encontrada") || message.includes("não pode");
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, isValidation ? 400 : 500) });
  }
}

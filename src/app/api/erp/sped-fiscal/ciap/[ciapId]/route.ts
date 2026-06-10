import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo, SessionError, ForbiddenError } from "@/lib/auth/session";
import { baixarCiapBem, excluirCiapBem, SpedError } from "@/domains/fiscal/application/sped-use-cases";

function statusDoErro(error: unknown): number {
  if (error instanceof SessionError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof SpedError) return 400;
  return 500;
}

// Baixa do bem (encerra a apropriação das parcelas a partir de agora).
export async function PUT(_request: Request, { params }: { params: { ciapId: string } }) {
  try {
    const session = await requireModulo("sped-fiscal");
    const scope = await getDevelopmentTenantScope();
    const bem = await baixarCiapBem(scope, params.ciapId, session.usuarioId);
    return NextResponse.json(bem);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao baixar o bem.";
    return NextResponse.json({ error: message }, { status: statusDoErro(error) });
  }
}

export async function DELETE(_request: Request, { params }: { params: { ciapId: string } }) {
  try {
    const session = await requireModulo("sped-fiscal");
    const scope = await getDevelopmentTenantScope();
    const r = await excluirCiapBem(scope, params.ciapId, session.usuarioId);
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir o bem.";
    return NextResponse.json({ error: message }, { status: statusDoErro(error) });
  }
}

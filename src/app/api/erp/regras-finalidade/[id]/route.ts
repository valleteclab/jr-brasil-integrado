import { NextResponse } from "next/server";
import { archiveRegraFinalidade, updateRegraFinalidade } from "@/domains/fiscal/application/finalidade-regra-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("regras-finalidade");
    const scope = await getDevelopmentTenantScope();
    const rule = await updateRegraFinalidade(scope, params.id, await request.json());

    return NextResponse.json({ id: rule.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível atualizar a regra de finalidade.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("regras-finalidade");
    const scope = await getDevelopmentTenantScope();
    const result = await archiveRegraFinalidade(scope, params.id);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível inativar a regra de finalidade.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

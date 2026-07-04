import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireAdmin } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { updateAgentPhone, deleteAgentPhone, AgentPhoneError } from "@/domains/agent/application/agent-phones-use-cases";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as { ativo?: boolean; role?: string; nome?: string };
    const telefone = await updateAgentPhone(scope, params.id, body);
    return NextResponse.json(telefone);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar telefone.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof AgentPhoneError ? 400 : 500) });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const result = await deleteAgentPhone(scope, params.id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao remover telefone.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof AgentPhoneError ? 400 : 500) });
  }
}

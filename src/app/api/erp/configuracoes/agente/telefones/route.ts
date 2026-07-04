import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo, requireAdmin } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { listAgentPhones, createAgentPhone, AgentPhoneError } from "@/domains/agent/application/agent-phones-use-cases";

// Lista os telefones autorizados a operar o agente por WhatsApp.
export async function GET() {
  try {
    await requireModulo("configuracoes");
    const scope = await getDevelopmentTenantScope();
    const telefones = await listAgentPhones(scope);
    return NextResponse.json({ telefones });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar telefones.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

// Autoriza um novo telefone (admin — libera ações no WhatsApp conforme o papel).
export async function POST(request: Request) {
  try {
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as { telefone?: string; nome?: string; role?: string };
    const telefone = await createAgentPhone(scope, { telefone: body.telefone ?? "", nome: body.nome, role: body.role });
    return NextResponse.json(telefone, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao autorizar telefone.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof AgentPhoneError ? 400 : 500) });
  }
}

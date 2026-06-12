import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo, requireAdmin } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { createAgentApiKey } from "@/mcp/auth";
import type { AgentRole } from "@/domains/agent/types";

const ROLES: AgentRole[] = ["GESTOR", "VENDEDOR"];

// Lista as chaves de API do agente/MCP da empresa (sem expor a chave em si).
export async function GET() {
  try {
    await requireModulo("configuracoes");
    const scope = await getDevelopmentTenantScope();
    const chaves = await prisma.chaveApiAgente.findMany({
      where: { tenantId: scope.tenantId, empresaId: scope.empresaId },
      orderBy: { criadoEm: "desc" },
      select: { id: true, nome: true, role: true, chaveFinal: true, ativo: true, ultimoUsoEm: true, criadoEm: true }
    });
    return NextResponse.json({ chaves });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar chaves.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

// Cria uma chave nova. A chave em claro só é retornada AGORA (não recuperável depois).
export async function POST(request: Request) {
  try {
    // Emite credencial de API do agente/MCP (segredo) — restrito a admin.
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as { nome?: string; role?: string };
    const role: AgentRole = ROLES.includes(body.role as AgentRole) ? (body.role as AgentRole) : "GESTOR";
    const result = await createAgentApiKey(scope, { nome: body.nome ?? "Chave do agente", role });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar chave.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

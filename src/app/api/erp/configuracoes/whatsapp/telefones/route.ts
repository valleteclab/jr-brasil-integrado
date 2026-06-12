import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo, requireAdmin } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import type { AgentRole } from "@/domains/agent/types";

const ROLES: AgentRole[] = ["GESTOR", "VENDEDOR"];

// Telefones autorizados (vendedor/gestor) que podem operar o agente pelo WhatsApp.
export async function GET() {
  try {
    await requireModulo("configuracoes");
    const scope = await getDevelopmentTenantScope();
    const telefones = await prisma.agenteTelefone.findMany({
      where: { tenantId: scope.tenantId, empresaId: scope.empresaId },
      orderBy: { criadoEm: "desc" },
      select: { id: true, telefone: true, nome: true, role: true, ativo: true, criadoEm: true }
    });
    return NextResponse.json({ telefones });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar telefones.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    // Autoriza um telefone a operar o agente (controle de acesso) — restrito a admin.
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as { telefone?: string; nome?: string; role?: string };
    const telefone = (body.telefone ?? "").replace(/\D/g, "");
    if (telefone.length < 10) {
      return NextResponse.json({ error: "Informe um telefone válido com DDD." }, { status: 400 });
    }
    const role: AgentRole = ROLES.includes(body.role as AgentRole) ? (body.role as AgentRole) : "VENDEDOR";

    // telefone é único globalmente — bloqueia duplicidade entre empresas.
    const existente = await prisma.agenteTelefone.findUnique({ where: { telefone } });
    if (existente) {
      return NextResponse.json({ error: "Este telefone já está cadastrado." }, { status: 400 });
    }
    const criado = await prisma.agenteTelefone.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        telefone,
        nome: body.nome?.trim() || null,
        role
      }
    });
    return NextResponse.json({ id: criado.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao cadastrar telefone.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

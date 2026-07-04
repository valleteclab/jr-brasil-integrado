import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import type { AgentRole } from "../types";

/**
 * Telefones AUTORIZADOS a operar o agente pelo WhatsApp (AgenteTelefone). Cada telefone recebe um
 * papel (GESTOR = pode emitir boleto/nota; VENDEDOR = cria rascunhos). O telefone é único globalmente.
 */

export class AgentPhoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentPhoneError";
  }
}

const ROLES: AgentRole[] = ["GESTOR", "VENDEDOR"];
const soDigitos = (v: string) => (v ?? "").replace(/\D+/g, "");

export async function listAgentPhones(scope: TenantScope) {
  return prisma.agenteTelefone.findMany({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId },
    orderBy: { criadoEm: "desc" },
    select: { id: true, telefone: true, nome: true, role: true, ativo: true, criadoEm: true }
  });
}

export async function createAgentPhone(scope: TenantScope, input: { telefone: string; nome?: string; role?: string }) {
  const telefone = soDigitos(input.telefone);
  if (telefone.length < 10 || telefone.length > 13) {
    throw new AgentPhoneError("Informe o telefone com DDD (ex.: 41999998888).");
  }
  const role: AgentRole = ROLES.includes(input.role as AgentRole) ? (input.role as AgentRole) : "VENDEDOR";

  const existente = await prisma.agenteTelefone.findUnique({ where: { telefone } });
  if (existente) {
    throw new AgentPhoneError("Este telefone já está autorizado (para o agente, o telefone é único).");
  }

  return prisma.agenteTelefone.create({
    data: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      telefone,
      nome: input.nome?.trim() || null,
      role
    },
    select: { id: true, telefone: true, nome: true, role: true, ativo: true, criadoEm: true }
  });
}

export async function updateAgentPhone(scope: TenantScope, id: string, input: { ativo?: boolean; role?: string; nome?: string }) {
  const registro = await prisma.agenteTelefone.findFirst({ where: { id, tenantId: scope.tenantId, empresaId: scope.empresaId } });
  if (!registro) throw new AgentPhoneError("Telefone não encontrado.");
  return prisma.agenteTelefone.update({
    where: { id },
    data: {
      ...(input.ativo !== undefined ? { ativo: Boolean(input.ativo) } : {}),
      ...(input.role !== undefined && ROLES.includes(input.role as AgentRole) ? { role: input.role as AgentRole } : {}),
      ...(input.nome !== undefined ? { nome: input.nome?.trim() || null } : {})
    },
    select: { id: true, telefone: true, nome: true, role: true, ativo: true, criadoEm: true }
  });
}

export async function deleteAgentPhone(scope: TenantScope, id: string) {
  const registro = await prisma.agenteTelefone.findFirst({ where: { id, tenantId: scope.tenantId, empresaId: scope.empresaId } });
  if (!registro) throw new AgentPhoneError("Telefone não encontrado.");
  await prisma.agenteTelefone.delete({ where: { id } });
  return { ok: true };
}

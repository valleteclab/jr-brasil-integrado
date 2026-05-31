import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { secretLastChars } from "@/lib/security/secret-crypto";
import type { AgentRole } from "@/domains/agent/types";

const KEY_PREFIX = "jrb_agent_";

/** Hash determinístico da chave para lookup (a chave em si nunca é persistida). */
function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export type AgentApiContext = { scope: TenantScope; role: AgentRole };

/**
 * Gera uma nova chave de API para uma empresa. Retorna a chave em claro UMA vez
 * (não é recuperável depois — guardamos só o hash e os últimos caracteres).
 */
export async function createAgentApiKey(
  scope: TenantScope,
  input: { nome: string; role?: AgentRole }
) {
  const key = `${KEY_PREFIX}${randomBytes(24).toString("hex")}`;
  const registro = await prisma.chaveApiAgente.create({
    data: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      nome: input.nome.trim() || "Chave do agente",
      role: input.role ?? "GESTOR",
      hashChave: hashKey(key),
      chaveFinal: secretLastChars(key, 6)
    }
  });
  // `key` só existe aqui — exibir/copiar agora; depois fica indisponível.
  return { id: registro.id, nome: registro.nome, role: registro.role, chave: key, chaveFinal: registro.chaveFinal };
}

/** Resolve a chave (Bearer/env) para tenant+empresa+papel. Null se inválida/inativa. */
export async function resolveTenantFromApiKey(rawKey: string | null | undefined): Promise<AgentApiContext | null> {
  const key = (rawKey ?? "").trim().replace(/^Bearer\s+/i, "");
  if (!key.startsWith(KEY_PREFIX)) return null;

  const registro = await prisma.chaveApiAgente.findUnique({ where: { hashChave: hashKey(key) } });
  if (!registro || !registro.ativo) return null;

  // Marca uso (não bloqueia a resposta se falhar).
  prisma.chaveApiAgente
    .update({ where: { id: registro.id }, data: { ultimoUsoEm: new Date() } })
    .catch(() => undefined);

  return {
    scope: { tenantId: registro.tenantId, empresaId: registro.empresaId },
    role: registro.role as AgentRole
  };
}

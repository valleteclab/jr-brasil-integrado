import type { Prisma } from "@prisma/client";
import type { TenantScope } from "@/lib/auth/dev-session";

type AuditInput = {
  scope: TenantScope;
  usuarioId?: string;
  entidade: string;
  entidadeId: string;
  acao: string;
  payload?: Prisma.InputJsonValue;
};

export async function createAuditLog(tx: Prisma.TransactionClient, input: AuditInput) {
  await tx.auditoria.create({
    data: {
      tenantId: input.scope.tenantId,
      empresaId: input.scope.empresaId,
      usuarioId: input.usuarioId,
      entidade: input.entidade,
      entidadeId: input.entidadeId,
      acao: input.acao,
      payload: input.payload
    }
  });
}

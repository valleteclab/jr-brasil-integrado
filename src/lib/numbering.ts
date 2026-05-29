import type { Prisma } from "@prisma/client";
import type { TenantScope } from "@/lib/auth/dev-session";

type NumberedDelegate = {
  findFirst: (args: {
    where: { tenantId: string; empresaId: string };
    orderBy: { criadoEm: "desc" };
    select: { numero: true };
  }) => Promise<{ numero: string | null } | null>;
};

/**
 * Gera o próximo número sequencial para documentos operacionais (pedidos, orçamentos,
 * OS, compras, inventário) no formato `PREFIXO-000123`. Baseado no maior número existente
 * da empresa. Para documentos fiscais use a SequenciaFiscal (atômica).
 */
export async function nextDocumentNumber(
  delegate: NumberedDelegate,
  scope: TenantScope,
  prefix: string
) {
  const last = await delegate.findFirst({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId },
    orderBy: { criadoEm: "desc" },
    select: { numero: true }
  });

  let next = 1;

  if (last?.numero) {
    const digits = last.numero.replace(/\D/g, "");
    if (digits) {
      next = Number.parseInt(digits, 10) + 1;
    }
  }

  return `${prefix}-${String(next).padStart(6, "0")}`;
}

/**
 * Reserva atomicamente o próximo número de documento fiscal de uma série/modelo,
 * incrementando a SequenciaFiscal. Deve rodar dentro de uma transação.
 */
export async function nextFiscalNumber(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  modelo: "NFE" | "NFCE" | "NFSE",
  serie: string
) {
  const seq = await tx.sequenciaFiscal.upsert({
    where: {
      tenantId_empresaId_modelo_serie: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        modelo,
        serie
      }
    },
    update: { ultimoNumero: { increment: 1 } },
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      modelo,
      serie,
      ultimoNumero: 1
    }
  });

  return seq.ultimoNumero;
}

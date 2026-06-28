import type { AmbienteFiscal, Prisma } from "@prisma/client";
import type { TenantScope } from "@/lib/auth/dev-session";

/** Delegate mínimo para descobrir o maior número legado ao semear a sequência (uma vez). */
type NumberedDelegate = {
  findFirst: (args: {
    where: { tenantId: string; empresaId: string };
    orderBy: { numero: "desc" };
    select: { numero: true };
  }) => Promise<{ numero: string | null } | null>;
};

function formatNumero(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(6, "0")}`;
}

/** Extrai o valor numérico de um número de documento ("PV-000042" → 42). */
function parseNumero(numero: string | null | undefined): number {
  const digits = (numero ?? "").replace(/\D/g, "");
  return digits ? Number.parseInt(digits, 10) : 0;
}

/**
 * Gera o próximo número sequencial de documento operacional (PV/ORC/OS/PC/INV) de forma
 * ATÔMICA, no formato `PREFIXO-000123`. Deve rodar dentro de uma transação (recebe `tx`).
 *
 * Usa a SequenciaDocumento (UPDATE com lock de linha) para que dois PDVs/operadores criando
 * documentos ao mesmo tempo nunca recebam o mesmo número. Na primeira vez de cada
 * empresa/tipo, semeia a sequência a partir do maior número já existente (backfill), para
 * conviver com documentos criados antes desta tabela.
 */
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  prefix: string,
  legacyDelegate: NumberedDelegate
): Promise<string> {
  const where = {
    tenantId_empresaId_tipo: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      tipo: prefix
    }
  };

  const existente = await tx.sequenciaDocumento.findUnique({ where });
  if (existente) {
    const atualizada = await tx.sequenciaDocumento.update({
      where,
      data: { ultimoNumero: { increment: 1 } }
    });
    return formatNumero(prefix, atualizada.ultimoNumero);
  }

  // Primeira emissão desta empresa/tipo: semeia com o maior número legado + 1. O upsert
  // protege contra corrida na criação — um cria, o concorrente cai no increment.
  const ultimoLegado = await legacyDelegate.findFirst({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId },
    orderBy: { numero: "desc" },
    select: { numero: true }
  });
  const base = parseNumero(ultimoLegado?.numero);

  const seq = await tx.sequenciaDocumento.upsert({
    where,
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      tipo: prefix,
      ultimoNumero: base + 1
    },
    update: { ultimoNumero: { increment: 1 } }
  });
  return formatNumero(prefix, seq.ultimoNumero);
}

/**
 * Reserva atomicamente o próximo número de documento fiscal de uma série/modelo/AMBIENTE,
 * incrementando a SequenciaFiscal. Deve rodar dentro de uma transação.
 *
 * A numeração é SEPARADA por ambiente: testes em HOMOLOGAÇÃO não consomem a numeração de
 * PRODUÇÃO (senão criariam lacunas na faixa fiscal real, exigindo inutilização).
 */
export async function nextFiscalNumber(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  modelo: "NFE" | "NFCE" | "NFSE",
  serie: string,
  ambiente: AmbienteFiscal
) {
  const seq = await tx.sequenciaFiscal.upsert({
    where: {
      tenantId_empresaId_modelo_serie_ambiente: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        modelo,
        serie,
        ambiente
      }
    },
    update: { ultimoNumero: { increment: 1 } },
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      modelo,
      serie,
      ambiente,
      ultimoNumero: 1
    }
  });

  return seq.ultimoNumero;
}

import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { resolveFiscalProvider } from "../providers";
import type { ProviderContext } from "../providers/types";
import { getFiscalRuntimeConfig } from "./fiscal-config-use-cases";

const TX_OPTIONS = { maxWait: 10000, timeout: 30000 };

/**
 * Sincronização manual de status (fallback de polling para o webhook).
 * Consulta o provedor pelo `providerRef` da nota e atualiza o registro com o
 * EmitResult retornado (status/chave/protocolo/xmlUrl/danfeUrl/autorizadaEm).
 * A nota é carregada escopada por tenant/empresa. Registra auditoria.
 */
export async function syncNotaFiscalStatus(scope: TenantScope, notaId: string) {
  const nota = await prisma.notaFiscal.findFirst({
    where: { id: notaId, tenantId: scope.tenantId, empresaId: scope.empresaId }
  });

  if (!nota) {
    throw new Error("Nota fiscal não encontrada.");
  }
  if (!nota.providerRef) {
    throw new Error("Esta nota não possui referência do provedor para sincronizar.");
  }

  const config = await getFiscalRuntimeConfig(scope);
  const provider = resolveFiscalProvider(nota.provedor);
  const ctx: ProviderContext = {
    ambiente: config.ambiente,
    provedor: nota.provedor,
    baseUrl: config.baseUrl,
    emissionMode: config.emissionMode,
    token: config.token,
    cscId: config.cscId,
    cscToken: config.cscToken
  };

  const result = await provider.queryStatus(nota.providerRef, ctx);

  const updated = await prisma.$transaction(async (tx) => {
    const authorized = result.status === "AUTORIZADA";
    const canceled = result.status === "CANCELADA";
    const updatedNota = await tx.notaFiscal.update({
      where: { id: nota.id },
      data: {
        status: result.status,
        ...(result.chaveAcesso ? { chaveAcesso: result.chaveAcesso } : {}),
        ...(result.protocolo ? { protocolo: result.protocolo } : {}),
        ...(result.xmlUrl ? { xmlUrl: result.xmlUrl } : {}),
        ...(result.danfeUrl ? { danfeUrl: result.danfeUrl } : {}),
        ...(result.motivo ? { motivo: result.motivo } : {}),
        autorizadaEm: authorized ? nota.autorizadaEm ?? new Date() : nota.autorizadaEm,
        canceladaEm: canceled ? nota.canceladaEm ?? new Date() : nota.canceladaEm
      }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "NotaFiscal",
      entidadeId: nota.id,
      acao: "SYNC_STATUS",
      payload: {
        status: result.status,
        chave: result.chaveAcesso ?? null,
        protocolo: result.protocolo ?? null,
        motivo: result.motivo ?? null
      }
    });

    return updatedNota;
  }, TX_OPTIONS);

  return { id: updated.id, status: updated.status };
}

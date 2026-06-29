import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { resolveFiscalProvider } from "../providers";
import type { ProviderContext } from "../providers/types";
import { getFiscalRuntimeConfig } from "./fiscal-config-use-cases";
import { carregarCertificado } from "./certificado-use-cases";

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
  // Uma NFS-e do padrão NACIONAL (chave de 50 díg.) vive no Sistema Nacional (SEFIN): o status e os
  // eventos — inclusive cancelamento feito por fora, no portal nacional — ficam lá, INDEPENDENTE de
  // a nota ter sido transmitida via ACBr ou direto. Então a consulta de status vai ao provedor
  // NACIONAL pela chave quando houver A1; senão cai no provedor de emissão.
  const chaveNfse = (nota.chaveAcesso ?? "").replace(/\D/g, "");
  // Carrega o A1 da empresa para a consulta nacional — pode não vir em config.certificado quando o
  // provedor de emissão não é o NACIONAL (ex.: a nota saiu pela ACBr, mas vive no Sistema Nacional).
  const certificadoNfse =
    nota.modelo === "NFSE" && chaveNfse.length === 50
      ? config.certificado ?? (await carregarCertificado(scope).catch(() => null))
      : config.certificado;
  const consultarNacional = nota.modelo === "NFSE" && chaveNfse.length === 50 && Boolean(certificadoNfse?.pfx);
  const provedorConsulta = consultarNacional ? "NACIONAL" : nota.provedor;

  const provider = resolveFiscalProvider(provedorConsulta);
  const ctx: ProviderContext = {
    ambiente: nota.ambiente,
    provedor: provedorConsulta,
    baseUrl: config.baseUrl,
    emissionMode: config.emissionMode,
    token: config.token,
    cscId: config.cscId,
    cscToken: config.cscToken,
    // Provedores diretos (mTLS + assinatura) precisam do A1; o SEFAZ ainda da UF do emitente.
    ...(consultarNacional ? { certificado: certificadoNfse } : nota.provedor === "SEFAZ" ? { certificado: config.certificado } : {}),
    ...(nota.provedor === "SEFAZ" ? { ufEmitente: config.emitter.uf } : {})
  };

  // NFS-e nacional consulta pela CHAVE (50 díg.); os demais usam o providerRef interno.
  const refConsulta = consultarNacional ? chaveNfse : nota.providerRef;
  const result = await provider.queryStatus(refConsulta, ctx);

  // Consulta indeterminada (PROCESSANDO = falha de rede/HTTP) não pode rebaixar uma nota já
  // AUTORIZADA/CANCELADA — mantém o status atual nesse caso.
  const novoStatus = result.status === "PROCESSANDO" ? nota.status : result.status;

  const updated = await prisma.$transaction(async (tx) => {
    const authorized = novoStatus === "AUTORIZADA";
    const canceled = novoStatus === "CANCELADA";
    const updatedNota = await tx.notaFiscal.update({
      where: { id: nota.id },
      data: {
        status: novoStatus,
        ...(result.numero ? { numero: result.numero } : {}),
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

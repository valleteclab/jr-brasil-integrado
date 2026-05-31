import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { getFiscalRuntimeConfig } from "./fiscal-config-use-cases";
import { uploadSpedyCertificate } from "../providers/spedy-provider";
import { uploadAcbrCertificate } from "../providers/acbr-provider";
import type { ProviderContext } from "../providers/types";

export class CertificateUploadError extends Error {}

export type CertificateUploadResult = {
  ok: boolean;
  alreadyRegistered: boolean;
  message: string;
};

/**
 * Envia o certificado digital A1 (.pfx) da empresa ao provedor fiscal (hoje: Spedy).
 * O arquivo/senha são repassados ao provedor e NÃO são persistidos no nosso banco —
 * guardamos apenas metadados (nome/validade) para exibição.
 */
export async function uploadFiscalCertificate(
  scope: TenantScope,
  input: { buffer: Buffer; filename: string; password: string }
): Promise<CertificateUploadResult> {
  if (!input.buffer?.length) throw new CertificateUploadError("Selecione o arquivo do certificado (.pfx).");
  if (!input.password?.trim()) throw new CertificateUploadError("Informe a senha do certificado.");

  const config = await getFiscalRuntimeConfig(scope);
  if (config.provider !== "SPEDY" && config.provider !== "ACBR") {
    throw new CertificateUploadError("O envio de certificado pela plataforma está disponível para os provedores Spedy e ACBr. Para outros provedores, configure o certificado no painel do provedor.");
  }

  const ctx: ProviderContext = {
    ambiente: config.ambiente,
    provedor: config.provider,
    baseUrl: config.baseUrl,
    token: config.token,
    cscId: config.cscId,
    cscToken: config.cscToken
  };

  let alreadyRegistered = false;
  let expiresOn: string | undefined;
  if (config.provider === "ACBR") {
    const result = await uploadAcbrCertificate(ctx, config.emitter.cnpj, input.buffer, input.password.trim());
    if (!result.ok) throw new CertificateUploadError(result.message);
  } else {
    const result = await uploadSpedyCertificate(ctx, { buffer: input.buffer, filename: input.filename }, input.password.trim());
    alreadyRegistered = result.alreadyRegistered;
    expiresOn = result.expiresOn ?? undefined;
  }

  // Persiste apenas metadados (nunca o arquivo/senha).
  await prisma.configuracaoFiscal.update({
    where: { empresaId: scope.empresaId },
    data: {
      certificadoInfo: input.filename || "Certificado A1",
      certificadoValidade: expiresOn ? new Date(expiresOn) : undefined
    }
  });

  await prisma.$transaction(async (tx) => {
    await createAuditLog(tx, {
      scope,
      entidade: "ConfiguracaoFiscal",
      entidadeId: scope.empresaId,
      acao: "UPLOAD_CERTIFICATE",
      payload: { filename: input.filename, alreadyRegistered, provider: config.provider }
    });
  });

  return {
    ok: true,
    alreadyRegistered,
    message: alreadyRegistered
      ? "Certificado já estava cadastrado no provedor."
      : "Certificado enviado com sucesso ao provedor."
  };
}

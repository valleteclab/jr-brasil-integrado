import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { getFiscalRuntimeConfig } from "./fiscal-config-use-cases";
import { uploadSpedyCertificate } from "../providers/spedy-provider";
import { uploadAcbrCertificate, uploadAcbrLogotipo, deleteAcbrLogotipo } from "../providers/acbr-provider";
import type { ProviderContext } from "../providers/types";

export class CertificateUploadError extends Error {}

export class LogotipoUploadError extends Error {}

const LOGO_MIME = ["image/png", "image/jpeg"];
const LOGO_MAX_BYTES = 200 * 1024;

/**
 * Envia a logo da empresa emitente ao provedor fiscal (hoje: ACBr), para aparecer no
 * DANFE/DANFCE/DANFSE. PNG/JPEG até 200 KB. A imagem não é persistida no nosso banco —
 * fica no cadastro da empresa no provedor; guardamos só um metadado de exibição.
 */
export async function uploadFiscalLogotipo(
  scope: TenantScope,
  input: { buffer: Buffer; filename: string; mimeType: string }
): Promise<{ ok: boolean; message: string }> {
  if (!input.buffer?.length) throw new LogotipoUploadError("Selecione o arquivo de imagem da logo.");
  if (!LOGO_MIME.includes(input.mimeType)) {
    throw new LogotipoUploadError("Formato inválido. Envie a logo em PNG ou JPEG.");
  }
  if (input.buffer.length > LOGO_MAX_BYTES) {
    throw new LogotipoUploadError("A logo deve ter no máximo 200 KB.");
  }

  const config = await getFiscalRuntimeConfig(scope);
  if (config.provider !== "ACBR") {
    throw new LogotipoUploadError("O envio de logo pela plataforma está disponível para o provedor ACBr.");
  }

  const ctx: ProviderContext = {
    ambiente: config.ambiente,
    provedor: config.provider,
    baseUrl: config.baseUrl,
    token: config.token,
    cscId: config.cscId,
    cscToken: config.cscToken
  };

  const result = await uploadAcbrLogotipo(ctx, config.emitter.cnpj, input.buffer, input.mimeType, input.filename);
  if (!result.ok) throw new LogotipoUploadError(result.message);

  await prisma.configuracaoFiscal.update({
    where: { empresaId: scope.empresaId },
    data: { logotipoInfo: input.filename || "Logo" }
  });

  await prisma.$transaction(async (tx) => {
    await createAuditLog(tx, {
      scope,
      entidade: "ConfiguracaoFiscal",
      entidadeId: scope.empresaId,
      acao: "UPLOAD_LOGO",
      payload: { filename: input.filename, provider: config.provider }
    });
  });

  return result;
}

/** Remove a logo da empresa no provedor (ACBr) e limpa o metadado local. */
export async function removeFiscalLogotipo(scope: TenantScope): Promise<{ ok: boolean; message: string }> {
  const config = await getFiscalRuntimeConfig(scope);
  if (config.provider !== "ACBR") {
    throw new LogotipoUploadError("A remoção de logo pela plataforma está disponível para o provedor ACBr.");
  }

  const ctx: ProviderContext = {
    ambiente: config.ambiente,
    provedor: config.provider,
    baseUrl: config.baseUrl,
    token: config.token,
    cscId: config.cscId,
    cscToken: config.cscToken
  };

  const result = await deleteAcbrLogotipo(ctx, config.emitter.cnpj);
  if (!result.ok) throw new LogotipoUploadError(result.message);

  await prisma.configuracaoFiscal.update({
    where: { empresaId: scope.empresaId },
    data: { logotipoInfo: null }
  });

  await prisma.$transaction(async (tx) => {
    await createAuditLog(tx, {
      scope,
      entidade: "ConfiguracaoFiscal",
      entidadeId: scope.empresaId,
      acao: "REMOVE_LOGO",
      payload: { provider: config.provider }
    });
  });

  return result;
}

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

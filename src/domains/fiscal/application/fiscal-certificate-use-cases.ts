import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import type { AmbienteFiscal, ProvedorFiscal } from "@prisma/client";
import { getFiscalRuntimeConfig, empresaAcbrPayload } from "./fiscal-config-use-cases";
import { getCredenciaisProvedorPlataforma } from "./plataforma-provedor-use-cases";
import { salvarCertificado, type CertificadoResumo } from "./certificado-use-cases";
import { uploadSpedyCertificate } from "../providers/spedy-provider";
import { uploadAcbrCertificate, uploadAcbrLogotipo, deleteAcbrLogotipo, registrarEmpresaAcbr } from "../providers/acbr-provider";
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

  // Guarda a logo como data URL LOCALMENTE (usada no DANFE próprio do provedor SEFAZ direto). Quando
  // o provedor for ACBr, envia também a cópia para o backoffice deles (DANFE renderizado lá).
  const dataUrl = `data:${input.mimeType};base64,${input.buffer.toString("base64")}`;
  let result: { ok: boolean; message: string } = { ok: true, message: "Logo salva." };

  if (config.provider === "ACBR") {
    const ctx: ProviderContext = {
      ambiente: config.ambiente,
      provedor: config.provider,
      baseUrl: config.baseUrl,
      token: config.token,
      cscId: config.cscId,
      cscToken: config.cscToken
    };
    result = await uploadAcbrLogotipo(ctx, config.emitter.cnpj, input.buffer, input.mimeType, input.filename);
    if (!result.ok) throw new LogotipoUploadError(result.message);
  }

  await prisma.configuracaoFiscal.update({
    where: { empresaId: scope.empresaId },
    data: { logotipoInfo: input.filename || "Logo", logotipoConteudo: dataUrl }
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

  // No ACBr, remove a cópia do backoffice deles; nos demais provedores basta limpar o local.
  let result: { ok: boolean; message: string } = { ok: true, message: "Logo removida." };
  if (config.provider === "ACBR") {
    const ctx: ProviderContext = {
      ambiente: config.ambiente,
      provedor: config.provider,
      baseUrl: config.baseUrl,
      token: config.token,
      cscId: config.cscId,
      cscToken: config.cscToken
    };
    result = await deleteAcbrLogotipo(ctx, config.emitter.cnpj);
    if (!result.ok) throw new LogotipoUploadError(result.message);
  }

  await prisma.configuracaoFiscal.update({
    where: { empresaId: scope.empresaId },
    data: { logotipoInfo: null, logotipoConteudo: null }
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

/** Contexto de API da ACBr resolvido pelas credenciais da PLATAFORMA (independe do provedor de produtos). */
async function contextoAcbr(ambiente: AmbienteFiscal): Promise<ProviderContext | null> {
  const cred = await getCredenciaisProvedorPlataforma("ACBR", ambiente);
  const token = cred.clientSecret ?? process.env.ACBR_CLIENT_SECRET?.trim() ?? null;
  const cscId = cred.clientId ?? process.env.ACBR_CLIENT_ID?.trim() ?? null;
  if (!token) return null;
  return { ambiente, provedor: "ACBR" as ProvedorFiscal, baseUrl: cred.baseUrl, token, cscId, cscToken: null };
}

export type CertificadoDistribuicaoResult = {
  ok: boolean;
  resumo: CertificadoResumo;
  message: string;
};

/**
 * PONTO ÚNICO de entrada do certificado A1: um upload atende TODOS os provedores em uso.
 *  1. Guarda o .pfx + senha criptografados (CertificadoDigital) — fonte da verdade; valida
 *     arquivo/senha e serve a emissão direta (SEFAZ NF-e/NFC-e e NFS-e Nacional), que usa o
 *     A1 a cada emissão.
 *  2. Repassa o MESMO arquivo à ACBr quando ela for o provedor resolvido de produtos OU de
 *     serviços (garante antes a empresa cadastrada lá — idempotente).
 *  3. Spedy (legado): repassa quando for o provedor ativo.
 * Falha no repasse NÃO desfaz a guarda local (o cliente pode usar "Sincronizar ACBr", que
 * também reenvia o certificado guardado).
 */
export async function distribuirCertificadoFiscal(
  scope: TenantScope,
  input: { buffer: Buffer; filename: string; password: string }
): Promise<CertificadoDistribuicaoResult> {
  if (!input.buffer?.length) throw new CertificateUploadError("Selecione o arquivo do certificado (.pfx).");
  const senha = input.password?.trim();
  if (!senha) throw new CertificateUploadError("Informe a senha do certificado.");

  const resumo = await salvarCertificado(scope, {
    pfxBase64: input.buffer.toString("base64"),
    senha,
    arquivoNome: input.filename
  });

  const config = await getFiscalRuntimeConfig(scope);
  const partes: string[] = ["guardado com segurança para a emissão direta (SEFAZ / NFS-e Nacional)"];

  if (config.provider === "ACBR" || config.providerServicos === "ACBR") {
    const ctx = await contextoAcbr(config.ambiente);
    if (!ctx) {
      partes.push("ACBr: credenciais da plataforma não configuradas — use \"Sincronizar ACBr\" depois de configurá-las");
    } else {
      const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: scope.empresaId } });
      const registro = await registrarEmpresaAcbr(ctx, empresaAcbrPayload(empresa));
      if (!registro.ok) {
        partes.push(`ACBr: ${registro.message}`);
      } else {
        const envio = await uploadAcbrCertificate(ctx, empresa.cnpj, input.buffer, senha);
        partes.push(envio.ok ? "enviado ao provedor ACBr" : `ACBr: ${envio.message}`);
      }
    }
  }

  if (config.provider === "SPEDY") {
    const ctx: ProviderContext = {
      ambiente: config.ambiente,
      provedor: config.provider,
      baseUrl: config.baseUrl,
      token: config.token,
      cscId: config.cscId,
      cscToken: config.cscToken
    };
    try {
      const r = await uploadSpedyCertificate(ctx, { buffer: input.buffer, filename: input.filename }, senha);
      partes.push(r.alreadyRegistered ? "já estava cadastrado no Spedy" : "enviado ao Spedy");
    } catch (e) {
      partes.push(`Spedy: ${e instanceof Error ? e.message : "falha no envio"}`);
    }
  }

  // Metadados de exibição (nunca o arquivo/senha em claro na config fiscal).
  await prisma.configuracaoFiscal.upsert({
    where: { empresaId: scope.empresaId },
    update: {
      certificadoInfo: input.filename || "Certificado A1",
      certificadoValidade: resumo.validade ? new Date(resumo.validade) : undefined
    },
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      provedor: config.provider,
      ambiente: config.ambiente,
      certificadoInfo: input.filename || "Certificado A1",
      certificadoValidade: resumo.validade ? new Date(resumo.validade) : undefined
    }
  });

  await createAuditLog(prisma, {
    scope,
    entidade: "ConfiguracaoFiscal",
    entidadeId: scope.empresaId,
    acao: "UPLOAD_CERTIFICATE",
    payload: { filename: input.filename, destinos: partes }
  });

  return { ok: true, resumo, message: `Certificado A1: ${partes.join("; ")}.` };
}


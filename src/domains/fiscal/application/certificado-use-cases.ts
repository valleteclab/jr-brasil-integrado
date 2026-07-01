import { X509Certificate } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { encryptSecret, decryptSecret } from "@/lib/security/secret-crypto";
import { pfxToPem } from "@/domains/fiscal/providers/pfx-utils";

/**
 * GUARDA CRIPTOGRAFADA do certificado digital A1 (.pfx) por empresa.
 *
 * Diferente do upload de certificado para o provedor (ACBr/Spedy), que apenas
 * repassa o arquivo e NÃO o persiste, aqui o .pfx e a senha são armazenados
 * criptografados (encryptSecret) no model CertificadoDigital. Isso é necessário
 * para o provedor NACIONAL, que assina o DPS e faz mTLS direto com a SEFIN usando
 * o A1 da própria empresa — portanto precisa do material a cada emissão.
 */

export class CertificadoNacionalError extends Error {}

export type CertificadoResumo = {
  titularCnpj: string | null;
  validade: string | null;
  arquivoNome: string | null;
};

/** Extrai só os dígitos (CNPJ pode vir formatado/prefixado no subject do A1). */
function onlyDigits(value: string): string {
  return (value ?? "").replace(/\D+/g, "");
}

/**
 * Lê o .pfx (best-effort) para extrair metadados do titular: CNPJ e validade.
 * No e-CNPJ/A1 brasileiro o CNPJ costuma estar no CN (ex.: "EMPRESA LTDA:00000000000191")
 * ou no serialNumber do subject. Lança se a senha estiver incorreta.
 */
function lerMetadados(pfx: Buffer, senha: string): { titularCnpj: string | null; validade: Date | null } {
  // pfxToPem lê o A1 (forge + fallback OpenSSL p/ PFX moderno). Falha aqui = arquivo/senha inválidos.
  let certPem: string;
  try {
    certPem = pfxToPem(pfx, senha).certPem;
  } catch {
    throw new CertificadoNacionalError("Não foi possível ler o certificado — verifique o arquivo (.pfx) e a senha.");
  }

  let cert: X509Certificate;
  try {
    cert = new X509Certificate(certPem);
  } catch {
    return { titularCnpj: null, validade: null };
  }

  const validade = cert.validTo ? new Date(cert.validTo) : null;

  // Procura o CNPJ (14 dígitos) no subject — CN (commonName) e serialNumber são os campos usuais.
  // X509Certificate.subject vem como "CN=EMPRESA:00000000000191\nserialNumber=...".
  let titularCnpj: string | null = null;
  for (const linha of (cert.subject ?? "").split("\n")) {
    const idx = linha.indexOf("=");
    if (idx < 0) continue;
    const chave = linha.slice(0, idx).trim();
    if (chave !== "CN" && chave !== "serialNumber") continue;
    const digits = onlyDigits(linha.slice(idx + 1));
    const match = digits.match(/\d{14}/);
    if (match) {
      titularCnpj = match[0];
      break;
    }
  }

  return { titularCnpj, validade: Number.isNaN(validade?.getTime()) ? null : validade };
}

/**
 * Salva (upsert por empresa) o certificado A1 criptografado para a emissão nacional.
 * Recebe o .pfx em base64 + senha; extrai metadados; criptografa pfx e senha.
 */
export async function salvarCertificado(
  scope: TenantScope,
  input: { pfxBase64: string; senha: string; arquivoNome?: string }
): Promise<CertificadoResumo> {
  const pfxBase64 = (input.pfxBase64 ?? "").trim();
  if (!pfxBase64) throw new CertificadoNacionalError("Selecione o arquivo do certificado (.pfx).");
  if (!input.senha?.trim()) throw new CertificadoNacionalError("Informe a senha do certificado.");

  const pfx = Buffer.from(pfxBase64, "base64");
  if (!pfx.length) throw new CertificadoNacionalError("Arquivo do certificado inválido.");

  const senha = input.senha;
  const { titularCnpj, validade } = lerMetadados(pfx, senha);

  const where = scopedByTenantCompany(scope);
  const pfxCriptografado = encryptSecret(pfx.toString("base64"));
  const senhaCriptografada = encryptSecret(senha);
  const arquivoNome = input.arquivoNome?.trim() || null;

  await prisma.certificadoDigital.upsert({
    where: { empresaId: where.empresaId },
    update: {
      tenantId: where.tenantId,
      pfxCriptografado,
      senhaCriptografada,
      titularCnpj,
      validade,
      arquivoNome
    },
    create: {
      tenantId: where.tenantId,
      empresaId: where.empresaId,
      pfxCriptografado,
      senhaCriptografada,
      titularCnpj,
      validade,
      arquivoNome
    }
  });

  return {
    titularCnpj,
    validade: validade ? validade.toISOString() : null,
    arquivoNome
  };
}

/**
 * Carrega e descriptografa o certificado A1 da empresa. Usado pelo provedor NACIONAL
 * para assinar o DPS e estabelecer o mTLS com a SEFIN. Retorna null se não houver.
 */
export async function carregarCertificado(
  scope: TenantScope
): Promise<{ pfx: Buffer; senha: string } | null> {
  const where = scopedByTenantCompany(scope);
  const registro = await prisma.certificadoDigital.findUnique({
    where: { empresaId: where.empresaId }
  });
  if (!registro || registro.tenantId !== where.tenantId) return null;

  const pfx = Buffer.from(decryptSecret(registro.pfxCriptografado), "base64");
  const senha = decryptSecret(registro.senhaCriptografada);
  return { pfx, senha };
}

/** Metadados do certificado guardado, para a UI (sem expor o pfx/senha). */
export async function getCertificadoInfo(scope: TenantScope): Promise<CertificadoResumo | null> {
  const where = scopedByTenantCompany(scope);
  const registro = await prisma.certificadoDigital.findUnique({
    where: { empresaId: where.empresaId },
    select: { tenantId: true, titularCnpj: true, validade: true, arquivoNome: true }
  });
  if (!registro || registro.tenantId !== where.tenantId) return null;

  return {
    titularCnpj: registro.titularCnpj,
    validade: registro.validade ? registro.validade.toISOString() : null,
    arquivoNome: registro.arquivoNome
  };
}

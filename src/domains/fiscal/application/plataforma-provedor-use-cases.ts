import type { AmbienteFiscal } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/security/secret-crypto";

/** Provedores de emissão integrados e o tipo de credencial de cada um. */
export const PROVEDORES_FISCAIS = [
  { key: "ACBR", label: "ACBr", cred: "oauth" as const },
  { key: "SEFAZ", label: "SEFAZ (NF-e direto)", cred: "certificado" as const },
  { key: "SPEDY", label: "Spedy", cred: "token" as const },
  { key: "FOCUS_NFE", label: "Focus NFe", cred: "token" as const },
  { key: "NFEIO", label: "NFe.io", cred: "token" as const },
  { key: "PLUGNOTAS", label: "PlugNotas", cred: "token" as const },
  { key: "WEBMANIA", label: "Webmania", cred: "token" as const }
];

/**
 * Tipo de credencial do provedor:
 * - "oauth": Client ID + Client Secret (ex.: ACBr).
 * - "token": chave/token de API (demais intermediários).
 * - "certificado": autentica direto na SEFAZ pelo certificado A1 da EMPRESA (sem credencial de
 *   plataforma). Emite NF-e (modelo 55) nos web services da SEFAZ, sem intermediário.
 */
export type CredencialTipo = "oauth" | "token" | "certificado";

export function provedorCred(provedor: string): CredencialTipo {
  return PROVEDORES_FISCAIS.find((p) => p.key === provedor)?.cred ?? "token";
}

/** URLs padrão da ACBr por ambiente. Demais provedores derivam a própria base internamente. */
export const ACBR_DEFAULT_BASE: Record<AmbienteFiscal, string> = {
  HOMOLOGACAO: "https://hom.acbr.api.br",
  PRODUCAO: "https://prod.acbr.api.br"
};

const DEFAULT_BASE: Record<string, Partial<Record<AmbienteFiscal, string>>> = {
  ACBR: ACBR_DEFAULT_BASE
};

export function defaultBaseUrl(provedor: string, ambiente: AmbienteFiscal): string {
  return DEFAULT_BASE[provedor]?.[ambiente] ?? "";
}

/** Provedor de emissão ativo na plataforma (default ACBr). */
export async function getProvedorFiscalAtivo(): Promise<string> {
  const cfg = await prisma.plataformaConfiguracao.findUnique({ where: { id: "default" } });
  return cfg?.provedorFiscalAtivo ?? "ACBR";
}

export type CredenciaisProvedorPlataforma = {
  clientId: string | null;
  clientSecret: string | null;
  token: string | null;
  baseUrl: string | null;
};

/**
 * Credenciais do provedor no nível da PLATAFORMA (do dono do SaaS) para um ambiente. Usado pelo
 * runtime de emissão — sem exigir admin, pois roda durante a emissão. Decripta os segredos e
 * aplica a URL padrão do provedor/ambiente quando não houver uma configurada.
 */
export async function getCredenciaisProvedorPlataforma(provedor: string, ambiente: AmbienteFiscal): Promise<CredenciaisProvedorPlataforma> {
  const row = await prisma.plataformaProvedorFiscal.findUnique({
    where: { provedor_ambiente: { provedor, ambiente } }
  });
  const base = row?.baseUrl?.trim() || defaultBaseUrl(provedor, ambiente);
  return {
    clientId: row?.clientIdCriptografado ? decryptSecret(row.clientIdCriptografado) : null,
    clientSecret: row?.clientSecretCriptografado ? decryptSecret(row.clientSecretCriptografado) : null,
    token: row?.tokenCriptografado ? decryptSecret(row.tokenCriptografado) : null,
    baseUrl: base ? base.replace(/\/$/, "") : null
  };
}

import type { AmbienteFiscal } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/security/secret-crypto";

/** URLs padrão da ACBr por ambiente (usadas quando o dono do SaaS não define uma própria). */
export const ACBR_DEFAULT_BASE: Record<AmbienteFiscal, string> = {
  HOMOLOGACAO: "https://hom.acbr.api.br",
  PRODUCAO: "https://prod.acbr.api.br"
};

export type CredenciaisAcbrPlataforma = {
  clientId: string | null;
  clientSecret: string | null;
  baseUrl: string;
};

/**
 * Credenciais do ACBr no nível da PLATAFORMA (do dono do SaaS) para um ambiente. Usado pelo
 * runtime de emissão — sem exigir admin, pois roda durante a emissão da empresa. Decripta os
 * segredos e aplica a URL padrão do ambiente quando não houver uma configurada.
 */
export async function getCredenciaisAcbrPlataforma(ambiente: AmbienteFiscal): Promise<CredenciaisAcbrPlataforma> {
  const row = await prisma.plataformaProvedorFiscal.findUnique({
    where: { provedor_ambiente: { provedor: "ACBR", ambiente } }
  });
  return {
    clientId: row?.clientIdCriptografado ? decryptSecret(row.clientIdCriptografado) : null,
    clientSecret: row?.clientSecretCriptografado ? decryptSecret(row.clientSecretCriptografado) : null,
    baseUrl: (row?.baseUrl?.trim() || ACBR_DEFAULT_BASE[ambiente]).replace(/\/$/, "")
  };
}

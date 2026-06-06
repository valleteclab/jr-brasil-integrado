/**
 * Identidade visual (branding) da empresa exibida NO SISTEMA: logo na barra lateral e cor de
 * destaque do tema. É separado da logo fiscal (que vai ao DANFE via ACBr). A logo é guardada como
 * data URL (base64) no banco — sem storage externo — e a cor como hex (#rrggbb).
 */
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";

export class BrandingError extends Error {}

export type BrandingConfig = {
  logoSistema: string | null;
  corDestaque: string | null;
};

// Limite do data URL da logo (base64 é ~33% maior que o binário; ~300 KB de imagem cabem aqui).
const LOGO_DATAURL_MAX = 420 * 1024;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export async function getBranding(scope: TenantScope): Promise<BrandingConfig> {
  const empresa = await prisma.empresa.findUnique({
    where: { id: scope.empresaId },
    select: { logoSistema: true, corDestaque: true }
  });
  return { logoSistema: empresa?.logoSistema ?? null, corDestaque: empresa?.corDestaque ?? null };
}

export type SaveBrandingInput = {
  /** Data URL (data:image/png;base64,...) ou string vazia/null para remover. undefined = manter. */
  logoSistema?: string | null;
  /** Hex #rrggbb, ou null para voltar ao padrão. undefined = manter. */
  corDestaque?: string | null;
};

function validarLogo(value: string): string {
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(value)) {
    throw new BrandingError("Logo inválida. Envie uma imagem PNG, JPEG ou WebP.");
  }
  if (value.length > LOGO_DATAURL_MAX) {
    throw new BrandingError("A logo ficou muito grande mesmo após o ajuste. Tente uma imagem mais simples.");
  }
  return value;
}

export async function saveBranding(scope: TenantScope, input: SaveBrandingInput): Promise<BrandingConfig> {
  const data: { logoSistema?: string | null; corDestaque?: string | null } = {};

  if (input.logoSistema !== undefined) {
    const logo = (input.logoSistema ?? "").trim();
    data.logoSistema = logo ? validarLogo(logo) : null;
  }

  if (input.corDestaque !== undefined) {
    const cor = (input.corDestaque ?? "").trim();
    if (cor && !HEX_RE.test(cor)) throw new BrandingError("Cor inválida. Use o formato #RRGGBB.");
    data.corDestaque = cor || null;
  }

  const empresa = await prisma.empresa.update({
    where: { id: scope.empresaId },
    data,
    select: { logoSistema: true, corDestaque: true }
  });

  await createAuditLog(prisma, {
    scope,
    entidade: "Empresa",
    entidadeId: scope.empresaId,
    acao: "BRANDING_ATUALIZAR",
    payload: { corDestaque: empresa.corDestaque, temLogo: Boolean(empresa.logoSistema) }
  });

  return { logoSistema: empresa.logoSistema, corDestaque: empresa.corDestaque };
}

import type { AmbienteFiscal, ProvedorFiscal, RegimeTributario } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { decryptSecret, encryptSecret, secretLastChars } from "@/lib/security/secret-crypto";

export type FiscalConfigSummary = {
  configured: boolean;
  provider: ProvedorFiscal;
  environment: AmbienteFiscal;
  regime: RegimeTributario;
  baseUrl: string;
  tokenLast4: string | null;
  hasToken: boolean;
  cscId: string;
  hasCscToken: boolean;
  serieNfe: string;
  serieNfce: string;
  serieNfse: string;
  emitNfe: boolean;
  emitNfce: boolean;
  emitNfse: boolean;
  codigoMunicipioIbge: string;
  codigoServicoLc116Padrao: string;
  spedyModoEmissao: string;
  certificadoInfo: string;
  active: boolean;
  testedAt: string | null;
  lastError: string | null;
  notes: string;
};

export type SaveFiscalConfigInput = {
  provider: ProvedorFiscal;
  environment: AmbienteFiscal;
  regime: RegimeTributario;
  baseUrl?: string;
  token?: string;
  cscId?: string;
  cscToken?: string;
  serieNfe?: string;
  serieNfce?: string;
  serieNfse?: string;
  emitNfe?: boolean;
  emitNfce?: boolean;
  emitNfse?: boolean;
  codigoMunicipioIbge?: string;
  codigoServicoLc116Padrao?: string;
  spedyModoEmissao?: string;
  certificadoInfo?: string;
  active?: boolean;
  notes?: string;
};

function toSummary(config: {
  provedor: ProvedorFiscal;
  ambiente: AmbienteFiscal;
  regimeTributario: RegimeTributario;
  baseUrl: string | null;
  tokenCriptografado: string | null;
  cscId: string | null;
  cscTokenCriptografado: string | null;
  serieNfe: string;
  serieNfce: string;
  serieNfse: string;
  emitirNfe: boolean;
  emitirNfce: boolean;
  emitirNfse: boolean;
  codigoMunicipioIbge: string | null;
  codigoServicoLc116Padrao: string | null;
  spedyModoEmissao: string | null;
  certificadoInfo: string | null;
  ativo: boolean;
  testadoEm: Date | null;
  ultimoErro: string | null;
  observacoes: string | null;
} | null): FiscalConfigSummary {
  return {
    configured: Boolean(config),
    provider: config?.provedor ?? "MANUAL",
    environment: config?.ambiente ?? "HOMOLOGACAO",
    regime: config?.regimeTributario ?? "SIMPLES_NACIONAL",
    baseUrl: config?.baseUrl ?? "",
    tokenLast4: config?.tokenCriptografado ? secretLastChars(decryptSecret(config.tokenCriptografado)) : null,
    hasToken: Boolean(config?.tokenCriptografado),
    cscId: config?.cscId ?? "",
    hasCscToken: Boolean(config?.cscTokenCriptografado),
    serieNfe: config?.serieNfe ?? "1",
    serieNfce: config?.serieNfce ?? "1",
    serieNfse: config?.serieNfse ?? "1",
    emitNfe: config?.emitirNfe ?? true,
    emitNfce: config?.emitirNfce ?? false,
    emitNfse: config?.emitirNfse ?? false,
    codigoMunicipioIbge: config?.codigoMunicipioIbge ?? "",
    codigoServicoLc116Padrao: config?.codigoServicoLc116Padrao ?? "",
    spedyModoEmissao: config?.spedyModoEmissao ?? "COMPLETO",
    certificadoInfo: config?.certificadoInfo ?? "",
    active: config?.ativo ?? false,
    testedAt: config?.testadoEm?.toISOString() ?? null,
    lastError: config?.ultimoErro ?? null,
    notes: config?.observacoes ?? ""
  };
}

export async function getFiscalConfig(scope: TenantScope): Promise<FiscalConfigSummary> {
  const config = await prisma.configuracaoFiscal.findUnique({
    where: { empresaId: scope.empresaId }
  });
  return toSummary(config);
}

export async function saveFiscalConfig(scope: TenantScope, input: SaveFiscalConfigInput): Promise<FiscalConfigSummary> {
  const externalProvider = !["MANUAL", "INTERNO"].includes(input.provider);
  if (externalProvider && input.active) {
    const existing = await prisma.configuracaoFiscal.findUnique({ where: { empresaId: scope.empresaId } });
    const willHaveToken = Boolean(input.token?.trim()) || Boolean(existing?.tokenCriptografado);
    // SPEDY e Focus NFe derivam a base do ambiente (produção/sandbox), então não exigem
    // baseUrl — apenas o token. Os demais provedores externos exigem URL base + token.
    if (input.provider === "SPEDY") {
      if (!willHaveToken) {
        throw new Error("Para ativar a Spedy informe a chave de API (X-Api-Key) no campo token.");
      }
    } else if (input.provider === "FOCUS_NFE") {
      if (!willHaveToken) {
        throw new Error("Para ativar a Focus NFe informe o token de integração.");
      }
    } else {
      const willHaveUrl = Boolean(input.baseUrl?.trim()) || Boolean(existing?.baseUrl);
      if (!willHaveToken || !willHaveUrl) {
        throw new Error("Para ativar um provedor externo informe a URL base e o token de integração.");
      }
    }
  }

  const tokenData = input.token?.trim() ? { tokenCriptografado: encryptSecret(input.token.trim()) } : {};
  const cscData = input.cscToken?.trim() ? { cscTokenCriptografado: encryptSecret(input.cscToken.trim()) } : {};

  const config = await prisma.configuracaoFiscal.upsert({
    where: { empresaId: scope.empresaId },
    update: {
      provedor: input.provider,
      ambiente: input.environment,
      regimeTributario: input.regime,
      baseUrl: input.baseUrl?.trim() || null,
      cscId: input.cscId?.trim() || null,
      serieNfe: input.serieNfe?.trim() || "1",
      serieNfce: input.serieNfce?.trim() || "1",
      serieNfse: input.serieNfse?.trim() || "1",
      emitirNfe: input.emitNfe ?? true,
      emitirNfce: input.emitNfce ?? false,
      emitirNfse: input.emitNfse ?? false,
      codigoMunicipioIbge: input.codigoMunicipioIbge?.trim() || null,
      codigoServicoLc116Padrao: input.codigoServicoLc116Padrao?.trim() || null,
      spedyModoEmissao: input.spedyModoEmissao?.trim() || "COMPLETO",
      certificadoInfo: input.certificadoInfo?.trim() || null,
      ativo: input.active ?? false,
      observacoes: input.notes?.trim() || null,
      ultimoErro: null,
      ...tokenData,
      ...cscData
    },
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      provedor: input.provider,
      ambiente: input.environment,
      regimeTributario: input.regime,
      baseUrl: input.baseUrl?.trim() || null,
      cscId: input.cscId?.trim() || null,
      serieNfe: input.serieNfe?.trim() || "1",
      serieNfce: input.serieNfce?.trim() || "1",
      serieNfse: input.serieNfse?.trim() || "1",
      emitirNfe: input.emitNfe ?? true,
      emitirNfce: input.emitNfce ?? false,
      emitirNfse: input.emitNfse ?? false,
      codigoMunicipioIbge: input.codigoMunicipioIbge?.trim() || null,
      codigoServicoLc116Padrao: input.codigoServicoLc116Padrao?.trim() || null,
      spedyModoEmissao: input.spedyModoEmissao?.trim() || "COMPLETO",
      certificadoInfo: input.certificadoInfo?.trim() || null,
      ativo: input.active ?? false,
      observacoes: input.notes?.trim() || null,
      ...tokenData,
      ...cscData
    }
  });

  await prisma.$transaction(async (tx) => {
    await createAuditLog(tx, {
      scope,
      entidade: "ConfiguracaoFiscal",
      entidadeId: config.id,
      acao: "SAVE",
      payload: { provider: input.provider, environment: input.environment, active: config.ativo }
    });
  });

  return toSummary(config);
}

/** Carrega a configuração fiscal efetiva com o token descriptografado (uso interno na emissão). */
export async function getFiscalRuntimeConfig(scope: TenantScope) {
  const config = await prisma.configuracaoFiscal.findUnique({ where: { empresaId: scope.empresaId } });
  const empresa = await prisma.empresa.findFirst({
    where: { id: scope.empresaId, tenantId: scope.tenantId }
  });

  if (!empresa) {
    throw new Error("Empresa não encontrada para emissão fiscal.");
  }

  return {
    provider: config?.provedor ?? "MANUAL",
    ambiente: config?.ambiente ?? "HOMOLOGACAO",
    regime: config?.regimeTributario ?? empresa.regimeTributario,
    baseUrl: config?.baseUrl ?? null,
    emissionMode: config?.spedyModoEmissao ?? "COMPLETO",
    token: config?.tokenCriptografado ? decryptSecret(config.tokenCriptografado) : null,
    cscId: config?.cscId ?? null,
    cscToken: config?.cscTokenCriptografado ? decryptSecret(config.cscTokenCriptografado) : null,
    serieNfe: config?.serieNfe ?? "1",
    serieNfce: config?.serieNfce ?? "1",
    serieNfse: config?.serieNfse ?? "1",
    active: config?.ativo ?? true,
    emitter: {
      razaoSocial: empresa.razaoSocial,
      cnpj: empresa.cnpj,
      inscricaoEstadual: empresa.inscricaoEstadual,
      inscricaoMunicipal: empresa.inscricaoMunicipal,
      uf: empresa.enderecoUf,
      codigoMunicipioIbge: config?.codigoMunicipioIbge ?? empresa.codigoMunicipioIbge ?? null
    }
  };
}

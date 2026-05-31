import type { AmbienteFiscal, ProvedorFiscal, RegimeTributario } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { decryptSecret, encryptSecret, secretLastChars } from "@/lib/security/secret-crypto";
import { resolveFiscalProvider } from "@/domains/fiscal/providers";
import { updateAcbrNfceCsc } from "@/domains/fiscal/providers/acbr-provider";

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
  /** CSC da NFC-e (ACBr): idCSC (curto) + indicador de que o código já foi salvo. */
  nfceIdCsc: string;
  hasNfceCsc: boolean;
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
  logotipoInfo: string;
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
  nfceIdCsc?: string;
  nfceCsc?: string;
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
  nfceIdCsc: string | null;
  nfceCscCriptografado: string | null;
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
  logotipoInfo: string | null;
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
    nfceIdCsc: config?.nfceIdCsc ?? "",
    hasNfceCsc: Boolean(config?.nfceCscCriptografado),
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
    logotipoInfo: config?.logotipoInfo ?? "",
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
    } else if (input.provider === "ACBR") {
      // ACBr usa OAuth2: client_secret no campo token (cripto) e client_id no campo cscId.
      const willHaveClientId = Boolean(input.cscId?.trim()) || Boolean(existing?.cscId);
      if (!willHaveToken || !willHaveClientId) {
        throw new Error("Para ativar a ACBr informe o client_id e o client_secret.");
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
  const nfceCscData = input.nfceCsc?.trim() ? { nfceCscCriptografado: encryptSecret(input.nfceCsc.trim()) } : {};

  const config = await prisma.configuracaoFiscal.upsert({
    where: { empresaId: scope.empresaId },
    update: {
      provedor: input.provider,
      ambiente: input.environment,
      regimeTributario: input.regime,
      baseUrl: input.baseUrl?.trim() || null,
      cscId: input.cscId?.trim() || null,
      nfceIdCsc: input.nfceIdCsc?.trim() || null,
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
      ...cscData,
      ...nfceCscData
    },
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      provedor: input.provider,
      ambiente: input.environment,
      regimeTributario: input.regime,
      baseUrl: input.baseUrl?.trim() || null,
      cscId: input.cscId?.trim() || null,
      nfceIdCsc: input.nfceIdCsc?.trim() || null,
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
      ...cscData,
      ...nfceCscData
    }
  });

  // ACBr: quando um novo CSC da NFC-e é informado, propaga ao cadastro da empresa na ACBr
  // (config_nfce). Best-effort: a falha aqui não impede salvar a configuração local.
  let cscWarning: string | null = null;
  if (input.provider === "ACBR" && input.nfceCsc?.trim() && input.nfceIdCsc?.trim() && config.tokenCriptografado) {
    const empresa = await prisma.empresa.findFirst({ where: { id: scope.empresaId, tenantId: scope.tenantId } });
    if (empresa) {
      try {
        const result = await updateAcbrNfceCsc(
          {
            ambiente: config.ambiente,
            provedor: "ACBR",
            baseUrl: config.baseUrl,
            token: decryptSecret(config.tokenCriptografado),
            cscId: config.cscId,
            cscToken: null
          },
          empresa.cnpj,
          input.nfceIdCsc.trim(),
          input.nfceCsc.trim()
        );
        if (!result.ok) cscWarning = result.message;
      } catch (e) {
        cscWarning = e instanceof Error ? e.message : "Não foi possível enviar o CSC à ACBr agora.";
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await createAuditLog(tx, {
      scope,
      entidade: "ConfiguracaoFiscal",
      entidadeId: config.id,
      acao: "SAVE",
      // Nunca registrar o CSC; só se foi configurado.
      payload: { provider: input.provider, environment: input.environment, active: config.ativo, cscNfceAtualizado: Boolean(input.nfceCsc?.trim()) }
    });
  });

  const summary = toSummary(config);
  return cscWarning ? { ...summary, lastError: cscWarning } : summary;
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
    nfceIdCsc: config?.nfceIdCsc ?? null,
    nfceCsc: config?.nfceCscCriptografado ? decryptSecret(config.nfceCscCriptografado) : null,
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

export type TestFiscalConnectionResult = { ok: boolean; message: string };

/**
 * Testa as credenciais do provedor fiscal configurado, sem emitir nenhum documento.
 * Usa a configuração persistida (token descriptografado) e o `testConnection` do provedor.
 */
export async function testFiscalConnection(scope: TenantScope): Promise<TestFiscalConnectionResult> {
  const runtime = await getFiscalRuntimeConfig(scope);

  if (runtime.provider === "MANUAL" || runtime.provider === "INTERNO") {
    return { ok: true, message: "Provedor interno/homologação não requer credenciais externas." };
  }
  if (!runtime.token) {
    return { ok: false, message: "Nenhum token configurado. Salve a credencial do provedor antes de testar." };
  }

  const provider = resolveFiscalProvider(runtime.provider);
  if (!provider.testConnection) {
    return { ok: false, message: "Teste de conexão ainda não disponível para este provedor." };
  }

  try {
    const result = await provider.testConnection({
      ambiente: runtime.ambiente,
      provedor: runtime.provider,
      baseUrl: runtime.baseUrl,
      emissionMode: runtime.emissionMode,
      token: runtime.token,
      cscId: runtime.cscId,
      cscToken: runtime.cscToken
    });
    // Registra o último resultado para diagnóstico (sem expor o token).
    await prisma.configuracaoFiscal.update({
      where: { empresaId: scope.empresaId },
      data: { testadoEm: new Date(), ultimoErro: result.ok ? null : result.message }
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao testar conexão com o provedor.";
    return { ok: false, message };
  }
}

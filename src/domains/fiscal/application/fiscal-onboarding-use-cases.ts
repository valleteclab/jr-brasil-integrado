import type { AmbienteFiscal, ProvedorFiscal, RegimeTributario, TipoNegocio } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { saveFiscalConfig } from "./fiscal-config-use-cases";
import { applyNationalTaxBaseline, PREFIXO_BASE_NACIONAL, UFS } from "../national-tax-baseline";

export type FiscalOnboardingInput = {
  // Identificação da empresa emitente
  razaoSocial: string;
  nomeFantasia?: string;
  cnpj: string;
  inscricaoEstadual?: string;
  inscricaoMunicipal?: string;
  regime: RegimeTributario;
  tipoNegocio?: TipoNegocio;
  // Endereço fiscal
  enderecoLogradouro?: string;
  enderecoNumero?: string;
  enderecoComplemento?: string;
  enderecoBairro?: string;
  enderecoCidade?: string;
  enderecoUf: string;
  enderecoCep?: string;
  codigoMunicipioIbge?: string;
  telefone?: string;
  email?: string;
  // Emissão / provedor
  provider: ProvedorFiscal;
  environment: AmbienteFiscal;
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
  certificadoInfo?: string;
  active?: boolean;
  notes?: string;
  // Base tributária nacional
  gerarBaseNacional?: boolean;
};

export class FiscalOnboardingError extends Error {}

export type FiscalOnboardingData = {
  empresa: {
    razaoSocial: string;
    nomeFantasia: string;
    cnpj: string;
    inscricaoEstadual: string;
    inscricaoMunicipal: string;
    regime: RegimeTributario;
    tipoNegocio: TipoNegocio;
    enderecoLogradouro: string;
    enderecoNumero: string;
    enderecoComplemento: string;
    enderecoBairro: string;
    enderecoCidade: string;
    enderecoUf: string;
    enderecoCep: string;
    codigoMunicipioIbge: string;
    telefone: string;
    email: string;
  };
  config: {
    provider: ProvedorFiscal;
    environment: AmbienteFiscal;
    baseUrl: string;
    hasToken: boolean;
    cscId: string;
    hasCscToken: boolean;
    serieNfe: string;
    serieNfce: string;
    serieNfse: string;
    emitNfe: boolean;
    emitNfce: boolean;
    emitNfse: boolean;
    certificadoInfo: string;
    active: boolean;
    notes: string;
  };
  baselineRules: number;
};

/** Dados atuais da empresa/config para pré-preencher o wizard de onboarding fiscal. */
export async function getFiscalOnboardingData(scope: TenantScope): Promise<FiscalOnboardingData> {
  const [empresa, config, baselineRules] = await Promise.all([
    prisma.empresa.findUniqueOrThrow({ where: { id: scope.empresaId } }),
    prisma.configuracaoFiscal.findUnique({ where: { empresaId: scope.empresaId } }),
    prisma.regraTributaria.count({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        nome: { startsWith: PREFIXO_BASE_NACIONAL }
      }
    })
  ]);

  return {
    empresa: {
      razaoSocial: empresa.razaoSocial,
      nomeFantasia: empresa.nomeFantasia ?? "",
      cnpj: empresa.cnpj,
      inscricaoEstadual: empresa.inscricaoEstadual ?? "",
      inscricaoMunicipal: empresa.inscricaoMunicipal ?? "",
      regime: empresa.regimeTributario,
      tipoNegocio: empresa.tipoNegocio,
      enderecoLogradouro: empresa.enderecoLogradouro ?? "",
      enderecoNumero: empresa.enderecoNumero ?? "",
      enderecoComplemento: empresa.enderecoComplemento ?? "",
      enderecoBairro: empresa.enderecoBairro ?? "",
      enderecoCidade: empresa.enderecoCidade ?? "",
      enderecoUf: empresa.enderecoUf ?? "",
      enderecoCep: empresa.enderecoCep ?? "",
      codigoMunicipioIbge: empresa.codigoMunicipioIbge ?? "",
      telefone: empresa.telefone ?? "",
      email: empresa.email ?? ""
    },
    config: {
      provider: config?.provedor ?? "INTERNO",
      environment: config?.ambiente ?? "HOMOLOGACAO",
      baseUrl: config?.baseUrl ?? "",
      hasToken: Boolean(config?.tokenCriptografado),
      cscId: config?.cscId ?? "",
      hasCscToken: Boolean(config?.cscTokenCriptografado),
      serieNfe: config?.serieNfe ?? "1",
      serieNfce: config?.serieNfce ?? "1",
      serieNfse: config?.serieNfse ?? "1",
      emitNfe: config?.emitirNfe ?? true,
      emitNfce: config?.emitirNfce ?? false,
      emitNfse: config?.emitirNfse ?? false,
      certificadoInfo: config?.certificadoInfo ?? "",
      active: config?.ativo ?? false,
      notes: config?.observacoes ?? ""
    },
    baselineRules
  };
}

function required(value: string | undefined, label: string): string {
  const v = value?.trim();
  if (!v) throw new FiscalOnboardingError(`${label} é obrigatório.`);
  return v;
}

/**
 * Conclui o onboarding fiscal de uma empresa em um único fluxo: grava a identidade fiscal
 * do emitente, persiste a configuração de emissão (provedor/ambiente/séries/credenciais) e,
 * quando solicitado, gera a base tributária nacional para o regime/UF — deixando a empresa
 * pronta para emitir NF-e/NFC-e/NFS-e sem cadastro manual de alíquotas.
 */
export async function completeFiscalOnboarding(scope: TenantScope, input: FiscalOnboardingInput) {
  const razaoSocial = required(input.razaoSocial, "Razão social");
  const cnpj = required(input.cnpj, "CNPJ");
  const uf = required(input.enderecoUf, "UF").toUpperCase();

  if (!UFS.includes(uf as (typeof UFS)[number])) {
    throw new FiscalOnboardingError("UF inválida.");
  }

  // 1) Identidade fiscal do emitente
  await prisma.empresa.update({
    where: { id: scope.empresaId },
    data: {
      razaoSocial,
      nomeFantasia: input.nomeFantasia?.trim() || null,
      cnpj,
      inscricaoEstadual: input.inscricaoEstadual?.trim() || null,
      inscricaoMunicipal: input.inscricaoMunicipal?.trim() || null,
      regimeTributario: input.regime,
      ...(input.tipoNegocio ? { tipoNegocio: input.tipoNegocio } : {}),
      enderecoLogradouro: input.enderecoLogradouro?.trim() || null,
      enderecoNumero: input.enderecoNumero?.trim() || null,
      enderecoComplemento: input.enderecoComplemento?.trim() || null,
      enderecoBairro: input.enderecoBairro?.trim() || null,
      enderecoCidade: input.enderecoCidade?.trim() || null,
      enderecoUf: uf,
      enderecoCep: input.enderecoCep?.trim() || null,
      codigoMunicipioIbge: input.codigoMunicipioIbge?.trim() || null,
      telefone: input.telefone?.trim() || null,
      email: input.email?.trim() || null
    }
  });

  // 2) Configuração de emissão (reaproveita validação e criptografia de credenciais)
  const config = await saveFiscalConfig(scope, {
    provider: input.provider,
    environment: input.environment,
    regime: input.regime,
    baseUrl: input.baseUrl,
    token: input.token,
    cscId: input.cscId,
    cscToken: input.cscToken,
    serieNfe: input.serieNfe,
    serieNfce: input.serieNfce,
    serieNfse: input.serieNfse,
    emitNfe: input.emitNfe,
    emitNfce: input.emitNfce,
    emitNfse: input.emitNfse,
    codigoMunicipioIbge: input.codigoMunicipioIbge,
    certificadoInfo: input.certificadoInfo,
    active: input.active,
    notes: input.notes
  });

  // 3) Base tributária nacional (opcional)
  let baseline: { criadas: number } | null = null;
  if (input.gerarBaseNacional !== false) {
    baseline = await applyNationalTaxBaseline(scope, { regime: input.regime, uf });
  }

  await prisma.$transaction(async (tx) => {
    await createAuditLog(tx, {
      scope,
      entidade: "Empresa",
      entidadeId: scope.empresaId,
      acao: "FISCAL_ONBOARDING",
      payload: {
        regime: input.regime,
        uf,
        provider: input.provider,
        environment: input.environment,
        baselineRules: baseline?.criadas ?? 0
      }
    });
  });

  return { config, baseline };
}

import type { AmbienteFiscal, ProvedorFiscal, RegimeTributario, TipoNegocio } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { getFiscalConfig, saveFiscalConfig } from "./fiscal-config-use-cases";
import { getCertificadoInfo } from "./certificado-use-cases";
import { applyNationalTaxBaseline, PREFIXO_BASE_NACIONAL, UFS } from "../national-tax-baseline";
import { isValidCnpj, normalizeDocumento } from "@/lib/fiscal/documento";
import { isValidLc116 } from "../lc116";

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
  // Emissão. O PROVEDOR é global (/admin/provedor-fiscal); a empresa só escolhe o ambiente.
  // provider/baseUrl/token/cscId/cscToken ficam opcionais por retrocompatibilidade (não usados aqui).
  provider?: ProvedorFiscal;
  environment: AmbienteFiscal;
  baseUrl?: string;
  token?: string;
  cscId?: string;
  cscToken?: string;
  nfceIdCsc?: string;
  nfceCsc?: string;
  nfceIdCscProducao?: string;
  nfceCscProducao?: string;
  serieNfe?: string;
  serieNfce?: string;
  serieNfse?: string;
  proximoNumeroNfe?: number;
  proximoNumeroNfce?: number;
  proximoNumeroNfse?: number;
  emitNfe?: boolean;
  emitNfce?: boolean;
  emitNfse?: boolean;
  codigoServicoLc116Padrao?: string;
  descricaoServicoPadrao?: string;
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
    nfceIdCsc: string;
    hasNfceCsc: boolean;
    nfceIdCscProducao: string;
    hasNfceCscProducao: boolean;
    serieNfe: string;
    serieNfce: string;
    serieNfse: string;
    proximoNumeroNfe: number;
    proximoNumeroNfce: number;
    proximoNumeroNfse: number;
    emitNfe: boolean;
    emitNfce: boolean;
    emitNfse: boolean;
    codigoServicoLc116Padrao: string;
    descricaoServicoPadrao: string;
    certificadoInfo: string;
    active: boolean;
    notes: string;
  };
  certificado: {
    titularCnpj: string | null;
    validade: string | null;
    arquivoNome: string | null;
  } | null;
  baselineRules: number;
};

/** Dados atuais da empresa/config para pré-preencher o wizard de onboarding fiscal. */
export async function getFiscalOnboardingData(scope: TenantScope): Promise<FiscalOnboardingData> {
  const [empresa, config, certificado, baselineRules] = await Promise.all([
    prisma.empresa.findUniqueOrThrow({ where: { id: scope.empresaId } }),
    getFiscalConfig(scope),
    getCertificadoInfo(scope),
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
      provider: config.provider,
      environment: config.environment,
      baseUrl: config.baseUrl,
      hasToken: config.hasToken,
      cscId: config.cscId,
      hasCscToken: config.hasCscToken,
      nfceIdCsc: config.nfceIdCsc,
      hasNfceCsc: config.hasNfceCsc,
      nfceIdCscProducao: config.nfceIdCscProducao,
      hasNfceCscProducao: config.hasNfceCscProducao,
      serieNfe: config.serieNfe,
      serieNfce: config.serieNfce,
      serieNfse: config.serieNfse,
      proximoNumeroNfe: config.proximoNumeroNfe,
      proximoNumeroNfce: config.proximoNumeroNfce,
      proximoNumeroNfse: config.proximoNumeroNfse,
      emitNfe: config.emitNfe,
      emitNfce: config.emitNfce,
      emitNfse: config.emitNfse,
      codigoServicoLc116Padrao: config.codigoServicoLc116Padrao,
      descricaoServicoPadrao: config.descricaoServicoPadrao,
      certificadoInfo: config.certificadoInfo,
      active: config.configured ? config.active : true,
      notes: config.notes
    },
    certificado,
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
  const cnpj = normalizeDocumento(required(input.cnpj, "CNPJ"));
  if (!isValidCnpj(cnpj)) throw new FiscalOnboardingError("CNPJ inválido. Confira os caracteres e os dígitos verificadores.");
  const uf = required(input.enderecoUf, "UF").toUpperCase();

  if (!UFS.includes(uf as (typeof UFS)[number])) {
    throw new FiscalOnboardingError("UF inválida.");
  }

  if (!input.emitNfe && !input.emitNfce && !input.emitNfse) {
    throw new FiscalOnboardingError("Selecione ao menos um tipo de nota para emitir.");
  }
  if ((input.emitNfe || input.emitNfce) && !input.inscricaoEstadual?.trim()) {
    throw new FiscalOnboardingError("A inscricao estadual e obrigatoria para emitir NF-e ou NFC-e.");
  }
  if (input.emitNfse) {
    if (!input.inscricaoMunicipal?.trim()) {
      throw new FiscalOnboardingError("A inscricao municipal e obrigatoria para emitir NFS-e.");
    }
    if (!input.codigoMunicipioIbge?.trim()) {
      throw new FiscalOnboardingError("O codigo IBGE do municipio e obrigatorio para emitir NFS-e.");
    }
    if (!isValidLc116(input.codigoServicoLc116Padrao)) {
      throw new FiscalOnboardingError("Selecione o servico principal na lista da LC 116.");
    }
    if (!input.descricaoServicoPadrao?.trim()) {
      throw new FiscalOnboardingError("Informe a descricao padrao do servico.");
    }
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
    nfceIdCsc: input.nfceIdCsc,
    nfceCsc: input.nfceCsc,
    nfceIdCscProducao: input.nfceIdCscProducao,
    nfceCscProducao: input.nfceCscProducao,
    serieNfe: input.serieNfe,
    serieNfce: input.serieNfce,
    serieNfse: input.serieNfse,
    proximoNumeroNfe: input.proximoNumeroNfe,
    proximoNumeroNfce: input.proximoNumeroNfce,
    proximoNumeroNfse: input.proximoNumeroNfse,
    emitNfe: input.emitNfe,
    emitNfce: input.emitNfce,
    emitNfse: input.emitNfse,
    codigoMunicipioIbge: input.codigoMunicipioIbge,
    codigoServicoLc116Padrao: input.codigoServicoLc116Padrao,
    descricaoServicoPadrao: input.descricaoServicoPadrao,
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

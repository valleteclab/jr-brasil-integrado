import type { RegimeTributario, TipoNegocio, SegmentoEmpresa } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";

export const REGIMES_TRIBUTARIOS: RegimeTributario[] = [
  "SIMPLES_NACIONAL",
  "SIMPLES_EXCESSO_SUBLIMITE",
  "LUCRO_PRESUMIDO",
  "LUCRO_REAL",
  "MEI"
];

export const TIPOS_NEGOCIO: TipoNegocio[] = ["VENDA", "SERVICO", "AMBOS"];

export const SEGMENTOS_EMPRESA: SegmentoEmpresa[] = [
  "GERAL",
  "AUTOPECAS",
  "MATERIAL_CONSTRUCAO",
  "MERCADO"
];

export type CompanySettings = {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  inscricaoEstadual: string;
  inscricaoMunicipal: string;
  regimeTributario: RegimeTributario;
  tipoNegocio: TipoNegocio;
  segmento: SegmentoEmpresa;
  permiteVendaSemEstoque: boolean;
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

export type SaveCompanySettingsInput = Partial<CompanySettings>;

export class CompanySettingsError extends Error {}

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
] as const;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optional(value: unknown): string | null {
  return clean(value) || null;
}

function required(value: unknown, label: string): string {
  const text = clean(value);
  if (!text) throw new CompanySettingsError(`${label} é obrigatório.`);
  return text;
}

function normalizeUf(value: unknown): string | null {
  const uf = clean(value).toUpperCase();
  if (!uf) return null;
  if (!UFS.includes(uf as (typeof UFS)[number])) {
    throw new CompanySettingsError("UF inválida.");
  }
  return uf;
}

function normalizeRegime(value: unknown): RegimeTributario {
  const regime = clean(value) as RegimeTributario;
  if (!REGIMES_TRIBUTARIOS.includes(regime)) {
    throw new CompanySettingsError("Regime tributário inválido.");
  }
  return regime;
}

function normalizeTipoNegocio(value: unknown): TipoNegocio {
  const tipo = clean(value).toUpperCase() as TipoNegocio;
  if (!TIPOS_NEGOCIO.includes(tipo)) {
    throw new CompanySettingsError("Tipo de negócio inválido.");
  }
  return tipo;
}

function normalizeSegmento(value: unknown): SegmentoEmpresa {
  const seg = clean(value).toUpperCase() as SegmentoEmpresa;
  if (!SEGMENTOS_EMPRESA.includes(seg)) {
    throw new CompanySettingsError("Segmento inválido.");
  }
  return seg;
}

function toSettings(empresa: Awaited<ReturnType<typeof prisma.empresa.findUniqueOrThrow>>): CompanySettings {
  return {
    razaoSocial: empresa.razaoSocial,
    nomeFantasia: empresa.nomeFantasia ?? "",
    cnpj: empresa.cnpj,
    inscricaoEstadual: empresa.inscricaoEstadual ?? "",
    inscricaoMunicipal: empresa.inscricaoMunicipal ?? "",
    regimeTributario: empresa.regimeTributario,
    tipoNegocio: empresa.tipoNegocio,
    segmento: empresa.segmento,
    permiteVendaSemEstoque: empresa.permiteVendaSemEstoque,
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
  };
}

export async function getCompanySettings(scope: TenantScope): Promise<CompanySettings> {
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: scope.empresaId } });
  if (empresa.tenantId !== scope.tenantId) throw new CompanySettingsError("Empresa fora do escopo da sessão.");
  return toSettings(empresa);
}

export async function saveCompanySettings(
  scope: TenantScope,
  input: SaveCompanySettingsInput,
  usuarioId?: string
): Promise<CompanySettings> {
  const razaoSocial = required(input.razaoSocial, "Razão social");
  const cnpj = required(input.cnpj, "CNPJ");
  const regimeTributario = normalizeRegime(input.regimeTributario);
  const tipoNegocio = normalizeTipoNegocio(input.tipoNegocio);
  const segmento = normalizeSegmento(input.segmento);
  const enderecoUf = normalizeUf(input.enderecoUf);

  const existente = await prisma.empresa.findFirst({
    where: {
      tenantId: scope.tenantId,
      cnpj,
      id: { not: scope.empresaId }
    },
    select: { id: true }
  });
  if (existente) throw new CompanySettingsError("Já existe outra empresa com este CNPJ neste cliente.");

  const updated = await prisma.$transaction(async (tx) => {
    const empresa = await tx.empresa.update({
      where: { id: scope.empresaId },
      data: {
        razaoSocial,
        nomeFantasia: optional(input.nomeFantasia),
        cnpj,
        inscricaoEstadual: optional(input.inscricaoEstadual),
        inscricaoMunicipal: optional(input.inscricaoMunicipal),
        regimeTributario,
        tipoNegocio,
        segmento,
        permiteVendaSemEstoque: Boolean(input.permiteVendaSemEstoque),
        enderecoLogradouro: optional(input.enderecoLogradouro),
        enderecoNumero: optional(input.enderecoNumero),
        enderecoComplemento: optional(input.enderecoComplemento),
        enderecoBairro: optional(input.enderecoBairro),
        enderecoCidade: optional(input.enderecoCidade),
        enderecoUf,
        enderecoCep: optional(input.enderecoCep),
        codigoMunicipioIbge: optional(input.codigoMunicipioIbge),
        telefone: optional(input.telefone),
        email: optional(input.email)
      }
    });

    await tx.configuracaoFiscal.updateMany({
      where: { tenantId: scope.tenantId, empresaId: scope.empresaId },
      data: {
        regimeTributario,
        codigoMunicipioIbge: optional(input.codigoMunicipioIbge)
      }
    });

    await createAuditLog(tx, {
      scope,
      usuarioId,
      entidade: "Empresa",
      entidadeId: scope.empresaId,
      acao: "EMPRESA_ATUALIZAR_DADOS",
      payload: {
        razaoSocial,
        cnpj,
        regimeTributario,
        enderecoUf
      }
    });

    return empresa;
  });

  return toSettings(updated);
}

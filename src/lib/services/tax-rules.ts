import type { RegraTributaria, TipoOperacaoFiscal, TipoTributo } from "@prisma/client";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";

export type TaxRuleSummary = {
  id: string;
  name: string;
  tax: TipoTributo;
  operation: TipoOperacaoFiscal;
  originState: string;
  destinationState: string;
  companyRegime: string;
  ncm: string;
  cest: string;
  cfop: string;
  cst: string;
  csosn: string;
  taxClass: string;
  benefitCode: string;
  rate: string;
  baseReduction: string;
  deferral: string;
  presumedCredit: string;
  mva: string;
  stRate: string;
  fcp: string;
  validFrom: string;
  validUntil: string;
  active: boolean;
};

function decimalToInput(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(Number(value)).replace(".", ",");
}

function dateToInput(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

export function mapTaxRule(rule: RegraTributaria): TaxRuleSummary {
  return {
    id: rule.id,
    name: rule.nome,
    tax: rule.tributo,
    operation: rule.operacao,
    originState: rule.ufOrigem ?? "",
    destinationState: rule.ufDestino ?? "",
    companyRegime: rule.regimeEmpresa ?? "",
    ncm: rule.ncm ?? "",
    cest: rule.cest ?? "",
    cfop: rule.cfop ?? "",
    cst: rule.cst ?? "",
    csosn: rule.csosn ?? "",
    taxClass: rule.cClassTrib ?? "",
    benefitCode: rule.codigoBeneficioFiscal ?? "",
    rate: decimalToInput(rule.aliquota),
    baseReduction: decimalToInput(rule.reducaoBase),
    deferral: decimalToInput(rule.diferimento),
    presumedCredit: decimalToInput(rule.creditoPresumido),
    mva: decimalToInput(rule.mva),
    stRate: decimalToInput(rule.aliquotaIcmsSt),
    fcp: decimalToInput(rule.fcp),
    validFrom: dateToInput(rule.vigenciaInicio),
    validUntil: dateToInput(rule.vigenciaFim),
    active: rule.ativo
  };
}

export async function listTaxRules(): Promise<TaxRuleSummary[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada. Configure o banco de dados para listar regras tributárias.");
  }

  const scope = await getDevelopmentTenantScope();
  const rules = await prisma.regraTributaria.findMany({
    where: {
      tenantId: scope.tenantId,
      OR: [
        { empresaId: scope.empresaId },
        { empresaId: null }
      ]
    },
    orderBy: [
      { ativo: "desc" },
      { nome: "asc" }
    ]
  });

  return rules.map(mapTaxRule);
}

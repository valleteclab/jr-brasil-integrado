import type { Prisma, TipoOperacaoFiscal, TipoTributo } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { callOpenRouter } from "@/domains/ai/openrouter-service";
import { mapTaxRule } from "@/lib/services/tax-rules";

const TAXES: TipoTributo[] = ["ICMS", "IPI", "PIS", "COFINS", "ISS", "CBS", "IBS", "IS"];
const OPERATIONS: TipoOperacaoFiscal[] = ["COMPRA", "VENDA", "DEVOLUCAO_COMPRA", "DEVOLUCAO_VENDA", "TRANSFERENCIA", "REMESSA", "RETORNO"];

type TaxRulePayload = Record<string, unknown>;

function text(payload: TaxRulePayload, key: string) {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
}

function bool(payload: TaxRulePayload, key: string, fallback = true) {
  const value = payload[key];
  return typeof value === "boolean" ? value : fallback;
}

function numeric(payload: TaxRulePayload, key: string) {
  const value = payload[key];

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return Number(value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || null;
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function dateOrNull(value: string) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value.slice(0, 10)}T12:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function validatePayload(payload: TaxRulePayload) {
  const name = text(payload, "name");
  const tax = text(payload, "tax") as TipoTributo;
  const operation = text(payload, "operation") as TipoOperacaoFiscal;
  const ncm = onlyDigits(text(payload, "ncm"));
  const cest = onlyDigits(text(payload, "cest"));
  const validFrom = dateOrNull(text(payload, "validFrom"));
  const validUntil = dateOrNull(text(payload, "validUntil"));

  if (!name) {
    throw new Error("Informe o nome da regra tributária.");
  }

  if (!TAXES.includes(tax)) {
    throw new Error("Informe um tributo válido.");
  }

  if (!OPERATIONS.includes(operation)) {
    throw new Error("Informe uma operação fiscal válida.");
  }

  if (ncm && ncm.length !== 8) {
    throw new Error("NCM deve conter 8 dígitos.");
  }

  if (cest && cest.length !== 7) {
    throw new Error("CEST deve conter 7 dígitos.");
  }

  if (!validFrom) {
    throw new Error("Informe a vigência inicial da regra.");
  }

  return {
    nome: name,
    tributo: tax,
    operacao: operation,
    ufOrigem: text(payload, "originState").toUpperCase() || null,
    ufDestino: text(payload, "destinationState").toUpperCase() || null,
    regimeEmpresa: text(payload, "companyRegime") || null,
    ncm: ncm || null,
    cest: cest || null,
    cfop: onlyDigits(text(payload, "cfop")) || null,
    cst: text(payload, "cst") || null,
    csosn: text(payload, "csosn") || null,
    cClassTrib: text(payload, "taxClass") || null,
    codigoBeneficioFiscal: text(payload, "benefitCode") || null,
    aliquota: numeric(payload, "rate"),
    reducaoBase: numeric(payload, "baseReduction"),
    diferimento: numeric(payload, "deferral"),
    creditoPresumido: numeric(payload, "presumedCredit"),
    vigenciaInicio: validFrom,
    vigenciaFim: validUntil,
    ativo: bool(payload, "active", true)
  };
}

export async function createTaxRule(scope: TenantScope, payload: TaxRulePayload) {
  const input = validatePayload(payload);

  return prisma.$transaction(async (tx) => {
    const rule = await tx.regraTributaria.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        ...input
      }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "RegraTributaria",
      entidadeId: rule.id,
      acao: "CREATE",
      payload: { nome: rule.nome, tributo: rule.tributo, operacao: rule.operacao }
    });

    return rule;
  });
}

export async function updateTaxRule(scope: TenantScope, id: string, payload: TaxRulePayload) {
  const input = validatePayload(payload);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.regraTributaria.findFirst({
      where: {
        id,
        tenantId: scope.tenantId,
        empresaId: scope.empresaId
      }
    });

    if (!existing) {
      throw new Error("Regra tributária não encontrada.");
    }

    const rule = await tx.regraTributaria.update({
      where: { id },
      data: input
    });

    await createAuditLog(tx, {
      scope,
      entidade: "RegraTributaria",
      entidadeId: rule.id,
      acao: "UPDATE",
      payload: { antes: existing.nome, depois: rule.nome }
    });

    return rule;
  });
}

export async function archiveTaxRule(scope: TenantScope, id: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.regraTributaria.findFirst({
      where: {
        id,
        tenantId: scope.tenantId,
        empresaId: scope.empresaId
      }
    });

    if (!existing) {
      throw new Error("Regra tributária não encontrada.");
    }

    const rule = await tx.regraTributaria.update({
      where: { id },
      data: { ativo: false }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "RegraTributaria",
      entidadeId: rule.id,
      acao: "ARCHIVE",
      payload: { nome: rule.nome }
    });

    return { id: rule.id };
  });
}

function extractJson(content: string) {
  const match = content.match(/\{[\s\S]*\}/);

  if (!match) {
    throw new Error("A IA não retornou uma sugestão estruturada.");
  }

  return JSON.parse(match[0]) as Prisma.JsonObject;
}

export async function suggestTaxRuleWithAi(scope: TenantScope, payload: TaxRulePayload) {
  const content = await callOpenRouter(scope, [
    {
      role: "system",
      content: [
        "Você é um assistente fiscal brasileiro para ERP.",
        "Ajude a preencher uma regra tributária, mas não invente certeza legal.",
        "Responda somente JSON válido, sem markdown.",
        "Campos esperados: name, tax, operation, originState, destinationState, companyRegime, ncm, cest, cfop, cst, csosn, taxClass, benefitCode, rate, baseReduction, deferral, presumedCredit, validFrom, validUntil, active, notes.",
        "Use strings vazias quando não tiver segurança. active deve ser boolean."
      ].join(" ")
    },
    {
      role: "user",
      content: JSON.stringify(payload)
    }
  ], { maxTokens: 900, temperature: 0.1 });

  const suggestion = extractJson(content);

  return {
    suggestion,
    warning: "Sugestão gerada por IA. Revise com contador ou responsável fiscal antes de usar em NF-e."
  };
}

export async function listTaxRulesForApi(scope: TenantScope) {
  const rules = await prisma.regraTributaria.findMany({
    where: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId
    },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }]
  });

  return rules.map(mapTaxRule);
}

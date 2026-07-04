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

  const gnreReceita = onlyDigits(text(payload, "gnreReceita"));
  const gnreProduto = onlyDigits(text(payload, "gnreProduto"));

  if (gnreReceita && gnreReceita.length !== 6) {
    throw new Error("Receita GNRE deve conter 6 dígitos (ex.: 100099).");
  }

  if (gnreProduto && gnreProduto.length > 4) {
    throw new Error("Produto GNRE deve conter até 4 dígitos (tabela da UF).");
  }

  const gnreTipoDocOrigem = onlyDigits(text(payload, "gnreTipoDocOrigem"));
  const gnreDetalhamento = onlyDigits(text(payload, "gnreDetalhamento"));
  const gnreCamposExtras = text(payload, "gnreCamposExtras");

  if (gnreTipoDocOrigem && gnreTipoDocOrigem.length > 2) {
    throw new Error("Tipo de documento de origem GNRE deve ter 2 dígitos (10 = nº da nota, 22 = chave).");
  }

  if (gnreCamposExtras) {
    try {
      const parsed = JSON.parse(gnreCamposExtras) as { codigo?: unknown; valor?: unknown }[];
      if (!Array.isArray(parsed) || parsed.some((c) => !c || typeof c.codigo !== "string" || typeof c.valor !== "string")) {
        throw new Error("estrutura");
      }
    } catch {
      throw new Error('Campos extras GNRE devem ser JSON no formato [{"codigo":"38","valor":"{CHAVE}"}].');
    }
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
    mva: numeric(payload, "mva"),
    aliquotaIcmsSt: numeric(payload, "stRate"),
    fcp: numeric(payload, "fcp"),
    gnreReceita: gnreReceita || null,
    gnreProduto: gnreProduto || null,
    gnreTipoDocOrigem: gnreTipoDocOrigem ? gnreTipoDocOrigem.padStart(2, "0") : null,
    gnreDetalhamento: gnreDetalhamento ? gnreDetalhamento.padStart(6, "0") : null,
    gnreCamposExtras: gnreCamposExtras || null,
    vigenciaInicio: validFrom,
    vigenciaFim: validUntil,
    ativo: bool(payload, "active", true)
  };
}

export async function createTaxRule(scope: TenantScope, payload: TaxRulePayload) {
  const input = validatePayload(payload);

  // Duplicata: já existe regra ATIVA com os mesmos critérios de matching (tributo+operação+NCM+UFs+
  // CFOP+regime)? Bloqueia para não deixar duas regras concorrentes com resultado imprevisível.
  const duplicada = await prisma.regraTributaria.findFirst({
    where: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      ativo: true,
      tributo: input.tributo,
      operacao: input.operacao,
      ncm: input.ncm,
      ufOrigem: input.ufOrigem,
      ufDestino: input.ufDestino,
      cfop: input.cfop,
      regimeEmpresa: input.regimeEmpresa
    },
    select: { nome: true }
  });
  if (duplicada) {
    throw new Error(
      `Já existe uma regra ativa com os mesmos critérios ("${duplicada.nome}"). Edite a existente ou desative-a antes de criar outra igual.`
    );
  }

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

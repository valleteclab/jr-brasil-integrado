import type { Prisma, RegimeTributario } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";

/**
 * Base tributária nacional embutida (v1).
 *
 * Estas tabelas tornam a empresa "pronta para emitir" sem cadastro manual de alíquotas:
 * o onboarding gera automaticamente o conjunto-base de regras de venda conforme regime e
 * UF de origem. São valores modais/padrão de referência — o contador deve revisar casos
 * específicos (benefício fiscal, ST, NCM com IPI etc.) na tela de Regras tributárias, que
 * sempre vencem a base por especificidade.
 */

export const PREFIXO_BASE_NACIONAL = "Base nacional · ";

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
] as const;

export type Uf = (typeof UFS)[number];

/** Alíquota interna modal de ICMS por UF (%). Referência — revisar por produto/benefício. */
const ICMS_INTERNO: Record<Uf, number> = {
  AC: 19, AL: 19, AP: 18, AM: 20, BA: 20.5, CE: 20, DF: 20, ES: 17, GO: 19, MA: 22,
  MT: 17, MS: 17, MG: 18, PA: 19, PB: 20, PR: 19.5, PE: 20.5, PI: 21, RJ: 22, RN: 18,
  RS: 17, RO: 19.5, RR: 20, SC: 17, SP: 18, SE: 19, TO: 20
};

/** UFs do Sul/Sudeste (exceto ES) cuja saída para N/NE/CO/ES usa 7%. */
const ORIGEM_7 = new Set<Uf>(["SP", "RJ", "MG", "PR", "SC", "RS"]);
/** UFs de destino do grupo 7% (Norte, Nordeste, Centro-Oeste e ES). */
const DESTINO_7 = new Set<Uf>([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "PA", "PB", "PE", "PI", "RN", "RO", "RR", "SE", "TO"
]);

/** Alíquota interestadual de ICMS para produto nacional, dado origem/destino. */
export function aliquotaInterestadualIcms(ufOrigem: Uf, ufDestino: Uf): number {
  if (ufOrigem === ufDestino) return ICMS_INTERNO[ufDestino];
  if (ORIGEM_7.has(ufOrigem) && DESTINO_7.has(ufDestino)) return 7;
  return 12;
}

function isSimples(regime: RegimeTributario): boolean {
  return regime === "SIMPLES_NACIONAL" || regime === "MEI" || regime === "SIMPLES_EXCESSO_SUBLIMITE";
}

/** PIS/COFINS por regime: Simples não destaca (CST 49); Presumido cumulativo; Real não-cumulativo. */
function pisCofinsBaseline(regime: RegimeTributario) {
  if (isSimples(regime)) {
    return { cst: "49", pis: 0, cofins: 0 };
  }
  if (regime === "LUCRO_REAL") {
    return { cst: "01", pis: 1.65, cofins: 7.6 };
  }
  // LUCRO_PRESUMIDO (cumulativo)
  return { cst: "01", pis: 0.65, cofins: 3.0 };
}

export type BaselineRuleInput = Omit<
  Prisma.RegraTributariaCreateManyInput,
  "tenantId" | "empresaId" | "id" | "criadoEm" | "atualizadoEm"
>;

/**
 * Gera as regras-base de venda para o regime/UF informados. Determinístico, sem efeito
 * colateral. As regras de ICMS por destino só são geradas para regimes que destacam ICMS
 * (Lucro Presumido/Real); no Simples o destaque ocorre via CSOSN 102 no motor de cálculo.
 */
export function buildBaselineRules(regime: RegimeTributario, ufOrigem: Uf): BaselineRuleInput[] {
  const inicio = new Date();
  const regras: BaselineRuleInput[] = [];
  const simples = isSimples(regime);

  if (simples) {
    // ICMS no Simples: tributada sem permissão de crédito (CSOSN 102), sem alíquota destacada.
    regras.push({
      nome: `${PREFIXO_BASE_NACIONAL}ICMS · Simples Nacional (CSOSN 102)`,
      tributo: "ICMS",
      operacao: "VENDA",
      regimeEmpresa: regime,
      csosn: "102",
      aliquota: 0,
      vigenciaInicio: inicio,
      ativo: true
    });
  } else {
    // ICMS destacado: uma regra por UF de destino com a alíquota interestadual/interna.
    for (const ufDestino of UFS) {
      const aliquota = aliquotaInterestadualIcms(ufOrigem, ufDestino as Uf);
      regras.push({
        nome: `${PREFIXO_BASE_NACIONAL}ICMS · ${ufOrigem}→${ufDestino} (${aliquota}%)`,
        tributo: "ICMS",
        operacao: "VENDA",
        regimeEmpresa: regime,
        ufOrigem,
        ufDestino,
        cst: "00",
        aliquota,
        vigenciaInicio: inicio,
        ativo: true
      });
    }
  }

  const { cst, pis, cofins } = pisCofinsBaseline(regime);
  regras.push({
    nome: `${PREFIXO_BASE_NACIONAL}PIS · ${simples ? "Simples (CST 49)" : `CST ${cst} ${pis}%`}`,
    tributo: "PIS",
    operacao: "VENDA",
    regimeEmpresa: regime,
    cst,
    aliquota: pis,
    vigenciaInicio: inicio,
    ativo: true
  });
  regras.push({
    nome: `${PREFIXO_BASE_NACIONAL}COFINS · ${simples ? "Simples (CST 49)" : `CST ${cst} ${cofins}%`}`,
    tributo: "COFINS",
    operacao: "VENDA",
    regimeEmpresa: regime,
    cst,
    aliquota: cofins,
    vigenciaInicio: inicio,
    ativo: true
  });

  return regras;
}

/**
 * Aplica a base nacional para a empresa do escopo de forma idempotente: remove a base
 * anterior (identificada pelo prefixo), desvincula produtos que apontavam para ela e recria
 * o conjunto atualizado. Registra auditoria.
 */
export async function applyNationalTaxBaseline(
  scope: TenantScope,
  params: { regime: RegimeTributario; uf: string }
): Promise<{ criadas: number }> {
  const uf = params.uf.trim().toUpperCase();
  if (!UFS.includes(uf as Uf)) {
    throw new Error("UF de origem inválida para gerar a base tributária nacional.");
  }

  const regras = buildBaselineRules(params.regime, uf as Uf);

  return prisma.$transaction(async (tx) => {
    const anteriores = await tx.regraTributaria.findMany({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        nome: { startsWith: PREFIXO_BASE_NACIONAL }
      },
      select: { id: true }
    });
    const ids = anteriores.map((r) => r.id);

    if (ids.length) {
      await tx.produtoFiscal.updateMany({
        where: { tenantId: scope.tenantId, empresaId: scope.empresaId, regraTributariaId: { in: ids } },
        data: { regraTributariaId: null }
      });
      await tx.regraTributaria.deleteMany({ where: { id: { in: ids } } });
    }

    await tx.regraTributaria.createMany({
      data: regras.map((regra) => ({
        ...regra,
        tenantId: scope.tenantId,
        empresaId: scope.empresaId
      }))
    });

    await createAuditLog(tx, {
      scope,
      entidade: "RegraTributaria",
      entidadeId: scope.empresaId,
      acao: "APPLY_NATIONAL_BASELINE",
      payload: { regime: params.regime, uf, criadas: regras.length, removidas: ids.length }
    });

    return { criadas: regras.length };
  });
}

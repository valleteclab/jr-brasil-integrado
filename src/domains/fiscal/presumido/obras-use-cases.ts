import type { ModalidadeEmpreitada } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { PresumidoError } from "./apuracao-presumido-use-cases";

/**
 * CONTRATOS DE OBRA — é aqui que a modalidade da empreitada vira DADO.
 *
 * A diferença entre pagar 8% ou 32% de presunção numa obra de construção civil está na
 * modalidade do contrato (IN RFB 1.700/2017, art. 33), que nenhum campo da nota revela. Cadastrar
 * o contrato e vincular as medições resolve a classificação e, de quebra, deixa a trilha que uma
 * fiscalização pede: número do contrato, contratante e a justificativa da modalidade.
 */

export type ObraResumo = {
  id: string;
  numero: string;
  descricao: string | null;
  contratante: string | null;
  documento: string | null;
  modalidade: ModalidadeEmpreitada;
  observacoes: string | null;
  ativo: boolean;
  notasVinculadas: number;
};

const texto = (v: unknown, max = 200): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
};

const MODALIDADES: ModalidadeEmpreitada[] = ["TOTAL", "PARCIAL", "ADMINISTRACAO"];

export async function listarObras(scope: TenantScope): Promise<ObraResumo[]> {
  const obras = await prisma.obraContrato.findMany({
    where: scopedByTenantCompany(scope),
    orderBy: [{ ativo: "desc" }, { numero: "asc" }],
    include: { _count: { select: { notas: true } } }
  });
  return obras.map((o) => ({
    id: o.id,
    numero: o.numero,
    descricao: o.descricao,
    contratante: o.contratante,
    documento: o.documento,
    modalidade: o.modalidade,
    observacoes: o.observacoes,
    ativo: o.ativo,
    notasVinculadas: o._count.notas
  }));
}

export async function salvarObra(
  scope: TenantScope,
  input: {
    id?: string | null;
    numero?: unknown;
    descricao?: unknown;
    contratante?: unknown;
    documento?: unknown;
    modalidade?: unknown;
    observacoes?: unknown;
    ativo?: unknown;
  },
  usuarioId?: string
): Promise<ObraResumo> {
  const numero = texto(input.numero, 60);
  if (!numero) throw new PresumidoError("Informe o número do contrato (ex.: 006/2026).");
  const modalidade = MODALIDADES.includes(input.modalidade as ModalidadeEmpreitada)
    ? (input.modalidade as ModalidadeEmpreitada)
    : "TOTAL";

  const dados = {
    numero,
    descricao: texto(input.descricao, 300),
    contratante: texto(input.contratante, 200),
    documento: texto(input.documento, 20)?.replace(/\D/g, "") ?? null,
    modalidade,
    observacoes: texto(input.observacoes, 2000),
    ativo: input.ativo === undefined ? true : Boolean(input.ativo)
  };

  const existente = input.id
    ? await prisma.obraContrato.findFirst({ where: { id: String(input.id), ...scopedByTenantCompany(scope) } })
    : await prisma.obraContrato.findFirst({ where: { ...scopedByTenantCompany(scope), numero } });

  const obra = existente
    ? await prisma.obraContrato.update({ where: { id: existente.id }, data: dados })
    : await prisma.obraContrato.create({ data: { ...scopedByTenantCompany(scope), ...dados } });

  await prisma.$transaction(async (tx) =>
    createAuditLog(tx, {
      scope,
      usuarioId,
      entidade: "ObraContrato",
      entidadeId: obra.id,
      acao: existente ? "OBRA_ATUALIZADA" : "OBRA_CRIADA",
      payload: { numero: obra.numero, modalidade: obra.modalidade }
    })
  );

  const notasVinculadas = await prisma.notaFiscal.count({ where: { obraContratoId: obra.id } });
  return {
    id: obra.id,
    numero: obra.numero,
    descricao: obra.descricao,
    contratante: obra.contratante,
    documento: obra.documento,
    modalidade: obra.modalidade,
    observacoes: obra.observacoes,
    ativo: obra.ativo,
    notasVinculadas
  };
}

/** Vincula (ou desvincula, com obraId null) uma nota ao contrato de obra. */
export async function vincularNotaObra(
  scope: TenantScope,
  input: { notaId: string; obraId: string | null },
  usuarioId?: string
): Promise<{ notaId: string; obraId: string | null }> {
  const nota = await prisma.notaFiscal.findFirst({
    where: { id: input.notaId, ...scopedByTenantCompany(scope) },
    select: { id: true }
  });
  if (!nota) throw new PresumidoError("Nota fiscal não encontrada nesta empresa.");

  if (input.obraId) {
    const obra = await prisma.obraContrato.findFirst({
      where: { id: input.obraId, ...scopedByTenantCompany(scope) },
      select: { id: true }
    });
    if (!obra) throw new PresumidoError("Contrato de obra não encontrado nesta empresa.");
  }

  await prisma.notaFiscal.update({ where: { id: nota.id }, data: { obraContratoId: input.obraId } });
  await prisma.$transaction(async (tx) =>
    createAuditLog(tx, {
      scope,
      usuarioId,
      entidade: "NotaFiscal",
      entidadeId: nota.id,
      acao: input.obraId ? "NOTA_VINCULADA_OBRA" : "NOTA_DESVINCULADA_OBRA",
      payload: { obraContratoId: input.obraId }
    })
  );
  return { notaId: nota.id, obraId: input.obraId };
}

/** Regime de reconhecimento da receita: caixa (recebimento) ou competência (emissão). */
export async function salvarRegimeReceita(
  scope: TenantScope,
  caixa: boolean,
  usuarioId?: string
): Promise<{ regimeReceitaCaixa: boolean }> {
  const config = await prisma.configuracaoFiscal.findUnique({ where: { empresaId: scope.empresaId }, select: { id: true } });
  if (!config) throw new PresumidoError("Configure a emissão fiscal da empresa antes de definir o regime de receita.");
  await prisma.configuracaoFiscal.update({ where: { empresaId: scope.empresaId }, data: { regimeReceitaCaixa: caixa } });
  await prisma.$transaction(async (tx) =>
    createAuditLog(tx, {
      scope,
      usuarioId,
      entidade: "ConfiguracaoFiscal",
      entidadeId: config.id,
      acao: "REGIME_RECEITA",
      payload: { regimeReceitaCaixa: caixa }
    })
  );
  return { regimeReceitaCaixa: caixa };
}

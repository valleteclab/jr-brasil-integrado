import type { Prisma, TipoApuracaoFiscal, TipoOutraReceita } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { PresumidoError } from "./apuracao-presumido-use-cases";

/**
 * FECHAMENTO DA APURAÇÃO e OUTRAS RECEITAS.
 *
 * Fechar guarda o snapshot do que foi apurado no momento em que o DARF foi emitido. Se a base
 * mudar depois (nota lançada com atraso, recebimento conciliado fora de ordem), a tela passa a
 * mostrar a DIVERGÊNCIA entre o recolhido e o recalculado, em vez de reescrever o número — que é
 * o que permite decidir entre retificar e complementar.
 */

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export type FechamentoResumo = {
  fechadoEm: string;
  fechadoPor: string | null;
  observacao: string | null;
  totalRecolher: number;
  /** Diferença entre o total recalculado agora e o total fechado (0 = nada mudou). */
  divergencia: number;
};

export async function buscarFechamento(
  scope: TenantScope,
  tipo: TipoApuracaoFiscal,
  ano: number,
  periodo: number,
  totalAtual: number
): Promise<FechamentoResumo | null> {
  const f = await prisma.apuracaoFiscalFechada
    .findFirst({ where: { ...scopedByTenantCompany(scope), tipo, ano, periodo } })
    .catch(() => null);
  if (!f) return null;
  const total = Number(f.totalRecolher);
  return {
    fechadoEm: f.fechadoEm.toISOString(),
    fechadoPor: f.fechadoPor,
    observacao: f.observacao,
    totalRecolher: total,
    divergencia: round2(totalAtual - total)
  };
}

export async function fecharApuracao(
  scope: TenantScope,
  input: { tipo: TipoApuracaoFiscal; ano: number; periodo: number; snapshot: unknown; totalRecolher: number; observacao?: string | null },
  usuarioId?: string
): Promise<FechamentoResumo> {
  const { tipo, ano, periodo } = input;
  if (!Number.isInteger(ano) || !Number.isInteger(periodo)) throw new PresumidoError("Período inválido.");

  const existente = await prisma.apuracaoFiscalFechada.findFirst({
    where: { ...scopedByTenantCompany(scope), tipo, ano, periodo }
  });
  if (existente) throw new PresumidoError("Este período já está fechado. Reabra antes de fechar de novo.");

  const dados = {
    ...scopedByTenantCompany(scope),
    tipo,
    ano,
    periodo,
    snapshot: (input.snapshot ?? {}) as Prisma.InputJsonValue,
    totalRecolher: round2(input.totalRecolher),
    observacao: input.observacao?.trim() || null,
    fechadoPor: usuarioId ?? null
  };
  const f = await prisma.apuracaoFiscalFechada.create({ data: dados });

  await prisma.$transaction(async (tx) =>
    createAuditLog(tx, {
      scope,
      usuarioId,
      entidade: "ApuracaoFiscalFechada",
      entidadeId: f.id,
      acao: "APURACAO_FECHADA",
      payload: { tipo, ano, periodo, totalRecolher: dados.totalRecolher }
    })
  );

  return {
    fechadoEm: f.fechadoEm.toISOString(),
    fechadoPor: f.fechadoPor,
    observacao: f.observacao,
    totalRecolher: Number(f.totalRecolher),
    divergencia: 0
  };
}

export async function reabrirApuracao(
  scope: TenantScope,
  input: { tipo: TipoApuracaoFiscal; ano: number; periodo: number; motivo?: string | null },
  usuarioId?: string
): Promise<{ reaberto: true }> {
  const f = await prisma.apuracaoFiscalFechada.findFirst({
    where: { ...scopedByTenantCompany(scope), tipo: input.tipo, ano: input.ano, periodo: input.periodo }
  });
  if (!f) throw new PresumidoError("Este período não está fechado.");

  await prisma.apuracaoFiscalFechada.delete({ where: { id: f.id } });
  await prisma.$transaction(async (tx) =>
    createAuditLog(tx, {
      scope,
      usuarioId,
      entidade: "ApuracaoFiscalFechada",
      entidadeId: f.id,
      acao: "APURACAO_REABERTA",
      // O snapshot vai para a auditoria: reabrir não pode apagar o que foi recolhido.
      payload: { tipo: input.tipo, ano: input.ano, periodo: input.periodo, totalFechado: Number(f.totalRecolher), motivo: input.motivo ?? null, snapshot: f.snapshot }
    })
  );
  return { reaberto: true };
}

/* ── Outras receitas (fora de nota fiscal) ──────────────────────────────────────────────── */

export type OutraReceitaResumo = {
  id: string;
  competencia: string;
  tipo: TipoOutraReceita;
  descricao: string;
  valor: number;
  observacao: string | null;
};

export async function listarOutrasReceitas(
  scope: TenantScope,
  periodo: { inicio: Date; fim: Date }
): Promise<OutraReceitaResumo[]> {
  const receitas = await prisma.outraReceita.findMany({
    where: { ...scopedByTenantCompany(scope), competencia: { gte: periodo.inicio, lt: periodo.fim } },
    orderBy: { competencia: "asc" }
  });
  return receitas.map((r) => ({
    id: r.id,
    competencia: r.competencia.toISOString(),
    tipo: r.tipo,
    descricao: r.descricao,
    valor: Number(r.valor),
    observacao: r.observacao
  }));
}

const TIPOS: TipoOutraReceita[] = ["FINANCEIRA", "ALUGUEL", "GANHO_CAPITAL", "OUTRA"];

export async function salvarOutraReceita(
  scope: TenantScope,
  input: { id?: string | null; competencia?: unknown; tipo?: unknown; descricao?: unknown; valor?: unknown; observacao?: unknown },
  usuarioId?: string
): Promise<OutraReceitaResumo> {
  const descricao = typeof input.descricao === "string" ? input.descricao.trim().slice(0, 200) : "";
  if (!descricao) throw new PresumidoError("Descreva a receita (ex.: rendimento da aplicação em setembro).");
  const valor = Number(input.valor);
  if (!Number.isFinite(valor) || valor <= 0) throw new PresumidoError("Informe um valor maior que zero.");
  const competencia = input.competencia ? new Date(String(input.competencia)) : new Date();
  if (Number.isNaN(competencia.getTime())) throw new PresumidoError("Data de competência inválida.");
  const tipo = TIPOS.includes(input.tipo as TipoOutraReceita) ? (input.tipo as TipoOutraReceita) : "OUTRA";

  const dados = {
    competencia,
    tipo,
    descricao,
    valor: round2(valor),
    observacao: typeof input.observacao === "string" ? input.observacao.trim().slice(0, 1000) || null : null
  };

  const existente = input.id
    ? await prisma.outraReceita.findFirst({ where: { id: String(input.id), ...scopedByTenantCompany(scope) } })
    : null;
  const r = existente
    ? await prisma.outraReceita.update({ where: { id: existente.id }, data: dados })
    : await prisma.outraReceita.create({ data: { ...scopedByTenantCompany(scope), ...dados } });

  await prisma.$transaction(async (tx) =>
    createAuditLog(tx, {
      scope,
      usuarioId,
      entidade: "OutraReceita",
      entidadeId: r.id,
      acao: existente ? "OUTRA_RECEITA_ATUALIZADA" : "OUTRA_RECEITA_CRIADA",
      payload: { tipo: r.tipo, valor: Number(r.valor), competencia: r.competencia.toISOString() }
    })
  );

  return {
    id: r.id,
    competencia: r.competencia.toISOString(),
    tipo: r.tipo,
    descricao: r.descricao,
    valor: Number(r.valor),
    observacao: r.observacao
  };
}

export async function excluirOutraReceita(scope: TenantScope, id: string, usuarioId?: string): Promise<{ excluida: true }> {
  const r = await prisma.outraReceita.findFirst({ where: { id, ...scopedByTenantCompany(scope) } });
  if (!r) throw new PresumidoError("Receita não encontrada nesta empresa.");
  await prisma.outraReceita.delete({ where: { id: r.id } });
  await prisma.$transaction(async (tx) =>
    createAuditLog(tx, {
      scope,
      usuarioId,
      entidade: "OutraReceita",
      entidadeId: r.id,
      acao: "OUTRA_RECEITA_EXCLUIDA",
      payload: { tipo: r.tipo, valor: Number(r.valor), descricao: r.descricao }
    })
  );
  return { excluida: true };
}

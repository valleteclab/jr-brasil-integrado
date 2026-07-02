import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";

/**
 * DESPESAS RECORRENTES (folha salarial, aluguel, energia, contador, assinaturas...):
 * um modelo por despesa gera automaticamente as ContaPagar por COMPETÊNCIA ("AAAA-MM"),
 * com idempotência garantida pelo unique (recorrenciaId, competência) — o cron pode rodar
 * quantas vezes for sem duplicar. Valor VARIÁVEL (energia/folha): o título nasce como
 * estimativa e o valor real é ajustado na baixa (o campo "valor pago" já cobre isso).
 */

export class RecorrenciaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecorrenciaError";
  }
}

const PERIODICIDADES: Record<string, number> = { MENSAL: 1, BIMESTRAL: 2, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12 };

/** Quantos dias à frente as ocorrências são materializadas no contas a pagar. */
const HORIZONTE_DIAS = 45;
/** Trava de segurança por recorrência por execução (não inunda o contas a pagar). */
const MAX_OCORRENCIAS_POR_EXECUCAO = 24;

const competenciaDe = (ano: number, mesZeroBased: number) => `${ano}-${String(mesZeroBased + 1).padStart(2, "0")}`;

/** Vencimento da competência: dia escolhido, ajustado ao fim de mês curto (31 → 28/29 em fev). */
function vencimentoDaCompetencia(ano: number, mesZeroBased: number, dia: number): Date {
  const ultimoDia = new Date(ano, mesZeroBased + 1, 0).getDate();
  return new Date(ano, mesZeroBased, Math.min(dia, ultimoDia), 12, 0, 0);
}

type Recorrencia = NonNullable<Awaited<ReturnType<typeof prisma.despesaRecorrente.findFirst>>>;

/** Competências devidas da recorrência até o horizonte (respeita início, fim e periodicidade). */
function competenciasDevidas(r: Recorrencia, ate: Date): Array<{ competencia: string; vencimento: Date }> {
  const passo = PERIODICIDADES[r.periodicidade] ?? 1;
  const out: Array<{ competencia: string; vencimento: Date }> = [];
  let ano = r.dataInicio.getFullYear();
  let mes = r.dataInicio.getMonth();
  for (let i = 0; i < 600; i++) {
    const venc = vencimentoDaCompetencia(ano, mes, r.diaVencimento);
    if (venc > ate) break;
    if (r.dataFim && venc > r.dataFim) break;
    out.push({ competencia: competenciaDe(ano, mes), vencimento: venc });
    mes += passo;
    ano += Math.floor(mes / 12);
    mes %= 12;
  }
  return out;
}

/**
 * Gera as ContaPagar pendentes de TODAS as recorrências ativas (todas as empresas — cron) ou de
 * um escopo específico. Idempotente: competência já gerada é pulada pelo unique do banco.
 */
export async function gerarOcorrenciasRecorrentes(scopeFiltro?: TenantScope): Promise<{ geradas: number; erros: string[] }> {
  const ate = new Date(Date.now() + HORIZONTE_DIAS * 86400000);
  const recorrencias = await prisma.despesaRecorrente.findMany({
    where: { status: "ATIVA", ...(scopeFiltro ? scopedByTenantCompany(scopeFiltro) : {}) },
    include: { ocorrencias: { select: { recorrenciaCompetencia: true } } }
  });
  let geradas = 0;
  const erros: string[] = [];
  for (const r of recorrencias) {
    const existentes = new Set(r.ocorrencias.map((o) => o.recorrenciaCompetencia));
    const pendentes = competenciasDevidas(r, ate).filter((c) => !existentes.has(c.competencia)).slice(0, MAX_OCORRENCIAS_POR_EXECUCAO);
    for (const c of pendentes) {
      try {
        await prisma.contaPagar.create({
          data: {
            tenantId: r.tenantId,
            empresaId: r.empresaId,
            ambiente: r.ambiente,
            fornecedorId: r.fornecedorId,
            descricao: `${r.descricao} — ${c.competencia.slice(5)}/${c.competencia.slice(0, 4)}`,
            origem: "RECORRENTE",
            formaPagamento: r.formaPagamento,
            vencimento: c.vencimento,
            valor: r.valor,
            observacoes: r.valorVariavel
              ? "Valor ESTIMADO (despesa variável) — ajuste o valor real na baixa."
              : r.observacoes,
            contaBancariaId: r.contaBancariaId,
            classificacaoId: r.classificacaoId,
            recorrenciaId: r.id,
            recorrenciaCompetencia: c.competencia,
            status: "ABERTO"
          }
        });
        geradas++;
      } catch (e) {
        // P2002 (unique) = corrida benigna entre execuções; qualquer outro erro é reportado.
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("P2002") && !/unique/i.test(msg)) erros.push(`${r.descricao} ${c.competencia}: ${msg}`);
      }
    }
  }
  return { geradas, erros };
}

export type CreateRecorrenciaInput = {
  descricao: string;
  fornecedorId?: string | null;
  valor: number;
  valorVariavel?: boolean;
  periodicidade?: string;
  diaVencimento: number;
  dataInicio: Date;
  dataFim?: Date | null;
  formaPagamento?: string | null;
  contaBancariaId?: string | null;
  classificacaoId?: string | null;
  observacoes?: string | null;
};

export async function createRecorrencia(scope: TenantScope, input: CreateRecorrenciaInput, usuarioId?: string) {
  if (!input.descricao?.trim()) throw new RecorrenciaError("Informe a descrição da despesa (ex.: Folha salarial).");
  if (!(Number(input.valor) > 0)) throw new RecorrenciaError("Informe o valor da despesa (use a estimativa se for variável).");
  const dia = Math.floor(input.diaVencimento);
  if (!(dia >= 1 && dia <= 31)) throw new RecorrenciaError("Dia do vencimento deve ficar entre 1 e 31.");
  const periodicidade = (input.periodicidade ?? "MENSAL").toUpperCase();
  if (!PERIODICIDADES[periodicidade]) throw new RecorrenciaError("Periodicidade inválida.");
  if (Number.isNaN(input.dataInicio.getTime())) throw new RecorrenciaError("Data de início inválida.");
  if (input.dataFim && input.dataFim < input.dataInicio) throw new RecorrenciaError("A data final não pode ser anterior ao início.");

  const recorrencia = await prisma.$transaction(async (tx) => {
    const criada = await tx.despesaRecorrente.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        ambiente: scope.ambiente ?? "HOMOLOGACAO",
        descricao: input.descricao.trim(),
        fornecedorId: input.fornecedorId ?? null,
        valor: Math.round(Number(input.valor) * 100) / 100,
        valorVariavel: Boolean(input.valorVariavel),
        periodicidade,
        diaVencimento: dia,
        dataInicio: input.dataInicio,
        dataFim: input.dataFim ?? null,
        formaPagamento: input.formaPagamento ?? null,
        contaBancariaId: input.contaBancariaId ?? null,
        classificacaoId: input.classificacaoId ?? null,
        observacoes: input.observacoes?.trim() || null
      }
    });
    await createAuditLog(tx, {
      scope, usuarioId, entidade: "DespesaRecorrente", entidadeId: criada.id, acao: "CREATE",
      payload: { descricao: criada.descricao, valor: Number(criada.valor), periodicidade, diaVencimento: dia }
    });
    return criada;
  });

  // Materializa imediatamente as competências já devidas (não espera o próximo cron).
  await gerarOcorrenciasRecorrentes(scope).catch(() => undefined);
  return recorrencia;
}

export type RecorrenciaResumo = {
  id: string;
  descricao: string;
  fornecedorNome: string | null;
  valor: number;
  valorVariavel: boolean;
  periodicidade: string;
  diaVencimento: number;
  dataInicio: string;
  dataFim: string | null;
  classificacaoNome: string | null;
  status: string;
  ocorrenciasGeradas: number;
  ocorrenciasPagas: number;
  totalPagoAno: number;
  proximaOcorrencia: { vencimento: string; valor: number; status: string } | null;
};

export async function listRecorrencias(scope: TenantScope): Promise<RecorrenciaResumo[]> {
  const inicioAno = new Date(new Date().getFullYear(), 0, 1);
  const lista = await prisma.despesaRecorrente.findMany({
    where: scopedByTenantCompany(scope),
    orderBy: [{ status: "asc" }, { descricao: "asc" }],
    include: {
      fornecedor: { select: { razaoSocial: true } },
      classificacao: { select: { nome: true } },
      ocorrencias: { select: { status: true, vencimento: true, valor: true, valorPago: true, pagoEm: true } }
    }
  });
  return lista.map((r) => {
    const abertas = r.ocorrencias
      .filter((o) => ["ABERTO", "PARCIAL", "VENCIDO"].includes(o.status))
      .sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime());
    const proxima = abertas[0] ?? null;
    return {
      id: r.id,
      descricao: r.descricao,
      fornecedorNome: r.fornecedor?.razaoSocial ?? null,
      valor: Number(r.valor),
      valorVariavel: r.valorVariavel,
      periodicidade: r.periodicidade,
      diaVencimento: r.diaVencimento,
      dataInicio: r.dataInicio.toISOString(),
      dataFim: r.dataFim?.toISOString() ?? null,
      classificacaoNome: r.classificacao?.nome ?? null,
      status: r.status,
      ocorrenciasGeradas: r.ocorrencias.length,
      ocorrenciasPagas: r.ocorrencias.filter((o) => o.status === "PAGO").length,
      totalPagoAno: Math.round(r.ocorrencias
        .filter((o) => o.status === "PAGO" && o.pagoEm && o.pagoEm >= inicioAno)
        .reduce((s, o) => s + Number(o.valorPago), 0) * 100) / 100,
      proximaOcorrencia: proxima
        ? { vencimento: proxima.vencimento.toISOString(), valor: Number(proxima.valor), status: proxima.status }
        : null
    };
  });
}

/** Pausa/reativa/encerra a recorrência. ENCERRADA também cancela as ocorrências em aberto. */
export async function alterarStatusRecorrencia(scope: TenantScope, id: string, status: "ATIVA" | "PAUSADA" | "ENCERRADA", usuarioId?: string) {
  const r = await prisma.despesaRecorrente.findFirst({ where: { id, ...scopedByTenantCompany(scope) } });
  if (!r) throw new RecorrenciaError("Despesa recorrente não encontrada.");
  return prisma.$transaction(async (tx) => {
    if (status === "ENCERRADA") {
      await tx.contaPagar.updateMany({
        where: { tenantId: scope.tenantId, empresaId: scope.empresaId, recorrenciaId: id, status: { in: ["ABERTO", "PARCIAL", "VENCIDO"] } },
        data: { status: "CANCELADO" }
      });
    }
    const atualizada = await tx.despesaRecorrente.update({ where: { id }, data: { status } });
    await createAuditLog(tx, { scope, usuarioId, entidade: "DespesaRecorrente", entidadeId: id, acao: status, payload: { descricao: r.descricao } });
    return atualizada;
  });
}

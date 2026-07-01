import { getDevelopmentTenantScope, scopedByTenantCompanyAmbiente, type TenantScope } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { formatBrl } from "@/lib/formatters/currency";

/**
 * Visões complementares dos relatórios de contas a pagar/receber (escopo fechado com o usuário):
 * ranking por cliente/fornecedor e previsto × realizado do mês. O fluxo de caixa projetado vem de
 * `getCashFlow` (finance.ts) e o aging de `financeReport` (reports.ts) — aqui só o que faltava.
 */

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

const ABERTAS = ["ABERTO", "PARCIAL", "VENCIDO"] as const;

export type RankingRow = {
  nome: string;
  contas: number;
  total: string;
  totalNum: number;
  vencido: string;
  vencidoNum: number;
};

export type FinanceRankingReport = {
  clientes: RankingRow[];
  fornecedores: RankingRow[];
};

/** Top devedores (a receber em aberto por cliente) e credores (a pagar em aberto por fornecedor). */
export async function financeRankingReport(scopeArg?: TenantScope): Promise<FinanceRankingReport> {
  const scope = scopeArg ?? (await getDevelopmentTenantScope());
  const base = scopedByTenantCompanyAmbiente(scope);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const [receber, pagar] = await Promise.all([
    prisma.contaReceber.findMany({
      where: { ...base, status: { in: [...ABERTAS] } },
      select: {
        valor: true, valorPago: true, juros: true, multa: true, descontoBaixa: true, vencimento: true,
        cliente: { select: { razaoSocial: true, nomeFantasia: true } }
      }
    }),
    prisma.contaPagar.findMany({
      where: { ...base, status: { in: [...ABERTAS] } },
      select: {
        valor: true, valorPago: true, juros: true, multa: true, descontoBaixa: true, vencimento: true,
        fornecedor: { select: { razaoSocial: true, nomeFantasia: true } }
      }
    })
  ]);

  type Conta = (typeof receber)[number] | (typeof pagar)[number];
  const saldoDe = (c: Conta) =>
    round2(Number(c.valor) + Number(c.juros) + Number(c.multa) - Number(c.descontoBaixa) - Number(c.valorPago));

  const agrupar = (contas: Conta[], nomeDe: (c: Conta) => string): RankingRow[] => {
    const mapa = new Map<string, { contas: number; total: number; vencido: number }>();
    for (const c of contas) {
      const saldo = saldoDe(c);
      if (saldo <= 0) continue;
      const nome = nomeDe(c);
      const agg = mapa.get(nome) ?? { contas: 0, total: 0, vencido: 0 };
      agg.contas++;
      agg.total = round2(agg.total + saldo);
      if (c.vencimento < hoje) agg.vencido = round2(agg.vencido + saldo);
      mapa.set(nome, agg);
    }
    return [...mapa.entries()]
      .map(([nome, a]) => ({
        nome,
        contas: a.contas,
        total: formatBrl(a.total),
        totalNum: a.total,
        vencido: formatBrl(a.vencido),
        vencidoNum: a.vencido
      }))
      .sort((a, b) => b.totalNum - a.totalNum)
      .slice(0, 20);
  };

  return {
    clientes: agrupar(receber, (c) => {
      const cli = (c as (typeof receber)[number]).cliente;
      return cli?.nomeFantasia || cli?.razaoSocial || "—";
    }),
    fornecedores: agrupar(pagar, (c) => {
      const forn = (c as (typeof pagar)[number]).fornecedor;
      return forn?.nomeFantasia || forn?.razaoSocial || "—";
    })
  };
}

export type PrevistoRealizadoLado = {
  previsto: string;
  previstoNum: number;
  realizado: string;
  realizadoNum: number;
  /** realizado − previsto. */
  diferenca: string;
  diferencaNum: number;
  contasPrevistas: number;
};

export type PrevistoRealizadoReport = {
  competencia: string;
  receber: PrevistoRealizadoLado;
  pagar: PrevistoRealizadoLado;
};

/**
 * Previsto × realizado do mês: PREVISTO = contas (não canceladas) com VENCIMENTO no mês, pelo saldo
 * integral (valor + juros/multa − desconto); REALIZADO = o que efetivamente entrou/saiu no mês
 * (MovimentoFinanceiro de baixas, na data da baixa — mesma base do fechamento mensal).
 */
export async function previstoRealizadoReport(
  params?: { mes?: number; ano?: number },
  scopeArg?: TenantScope
): Promise<PrevistoRealizadoReport> {
  const scope = scopeArg ?? (await getDevelopmentTenantScope());
  const base = scopedByTenantCompanyAmbiente(scope);

  const hoje = new Date();
  const y = params?.ano && params.ano > 1900 ? params.ano : hoje.getFullYear();
  const m = params?.mes && params.mes >= 1 && params.mes <= 12 ? params.mes - 1 : hoje.getMonth();
  const inicio = new Date(y, m, 1, 0, 0, 0, 0);
  const fim = new Date(y, m + 1, 0, 23, 59, 59, 999);
  const competencia = inicio.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const [recPrev, pagPrev, movimentos] = await Promise.all([
    prisma.contaReceber.findMany({
      where: { ...base, status: { not: "CANCELADO" }, vencimento: { gte: inicio, lte: fim } },
      select: { valor: true, juros: true, multa: true, descontoBaixa: true }
    }),
    prisma.contaPagar.findMany({
      where: { ...base, status: { not: "CANCELADO" }, vencimento: { gte: inicio, lte: fim } },
      select: { valor: true, juros: true, multa: true, descontoBaixa: true }
    }),
    prisma.movimentoFinanceiro.findMany({
      where: {
        ...base,
        dataMovimento: { gte: inicio, lte: fim },
        OR: [{ contaPagarId: { not: null } }, { contaReceberId: { not: null } }]
      },
      select: { tipo: true, valor: true, contaPagarId: true, contaReceberId: true }
    })
  ]);

  const somaPrevista = (rows: Array<{ valor: unknown; juros: unknown; multa: unknown; descontoBaixa: unknown }>) =>
    round2(rows.reduce((s, c) => s + Number(c.valor) + Number(c.juros) + Number(c.multa) - Number(c.descontoBaixa), 0));

  const previstoReceber = somaPrevista(recPrev);
  const previstoPagar = somaPrevista(pagPrev);
  const realizadoReceber = round2(
    movimentos.filter((mv) => mv.tipo === "CREDITO" && mv.contaReceberId).reduce((s, mv) => s + Number(mv.valor), 0)
  );
  const realizadoPagar = round2(
    movimentos.filter((mv) => mv.tipo === "DEBITO" && mv.contaPagarId).reduce((s, mv) => s + Number(mv.valor), 0)
  );

  const lado = (previsto: number, realizado: number, contas: number): PrevistoRealizadoLado => ({
    previsto: formatBrl(previsto),
    previstoNum: previsto,
    realizado: formatBrl(realizado),
    realizadoNum: realizado,
    diferenca: formatBrl(round2(realizado - previsto)),
    diferencaNum: round2(realizado - previsto),
    contasPrevistas: contas
  });

  return {
    competencia,
    receber: lado(previstoReceber, realizadoReceber, recPrev.length),
    pagar: lado(previstoPagar, realizadoPagar, pagPrev.length)
  };
}

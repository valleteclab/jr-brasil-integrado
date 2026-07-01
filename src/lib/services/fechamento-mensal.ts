import { getDevelopmentTenantScope, scopedByTenantCompanyAmbiente, type TenantScope } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { formatBrl } from "@/lib/formatters/currency";
import { ordenarGrupos } from "@/domains/finance/application/classificacao-use-cases";

/**
 * FECHAMENTO MENSAL por classificação financeira — o relatório que o cliente fazia no Excel:
 * gastos do mês agrupados por classificação/grupo com IDEAL (orçamento mensal) × REAL (baixas),
 * mais o detalhamento de títulos pagos por classificação (espelho do relatório "títulos pagos por
 * classificações analíticas" do sistema anterior).
 *
 * REAL = MovimentoFinanceiro do período (DEBITO de ContaPagar / CREDITO de ContaReceber): captura o
 * valor LÍQUIDO efetivamente pago/recebido na data da baixa, incluindo baixas parciais. Juros/multa
 * e desconto exibidos no detalhe vêm do título (acumulados da conta).
 */

const DATE_FMT = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });
const SEM_CLASSIFICACAO = "Sem classificação";

function fmtDate(d: Date): string {
  return DATE_FMT.format(new Date(d));
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export type FechamentoLinha = {
  classificacaoId: string | null;
  codigo: string | null;
  nome: string;
  ideal: number;
  idealFmt: string;
  real: number;
  realFmt: string;
  /** real − ideal (positivo = estourou a meta). Zero quando não há meta. */
  desvio: number;
  desvioFmt: string;
  temMeta: boolean;
  titulos: number;
};

export type FechamentoGrupo = {
  grupo: string;
  ideal: number;
  idealFmt: string;
  real: number;
  realFmt: string;
  desvio: number;
  desvioFmt: string;
  linhas: FechamentoLinha[];
};

export type TituloPago = {
  titulo: string;
  numeroDocumento: string;
  dataBaixa: string;
  parceiro: string;
  valorTitulo: string;
  jurosMulta: string;
  desconto: string;
  totalPago: string;
  totalPagoNum: number;
};

export type ClasseTitulosPagos = {
  classificacao: string;
  codigo: string | null;
  grupo: string;
  registros: TituloPago[];
  totalPago: string;
  totalPagoNum: number;
  totalJurosMulta: string;
  totalDesconto: string;
};

export type FechamentoMensalReport = {
  competencia: string;
  inicio: string;
  fim: string;
  temPlano: boolean;
  resumo: {
    totalPago: string;
    totalPagoNum: number;
    totalRecebido: string;
    totalRecebidoNum: number;
    totalVendas: string;
    totalVendasNum: number;
    resultado: string;
    resultadoNum: number;
    totalIdeal: string;
    totalIdealNum: number;
    desvioTotal: string;
    desvioTotalNum: number;
    titulosPagos: number;
    titulosSemClassificacao: number;
  };
  despesas: FechamentoGrupo[];
  receitas: FechamentoGrupo[];
  titulosPorClassificacao: ClasseTitulosPagos[];
};

type ClasseInfo = { id: string | null; codigo: string | null; nome: string; grupo: string; ideal: number };

export async function fechamentoMensalReport(
  params?: { mes?: number; ano?: number },
  scopeArg?: TenantScope
): Promise<FechamentoMensalReport> {
  const scope = scopeArg ?? (await getDevelopmentTenantScope());
  const base = scopedByTenantCompanyAmbiente(scope);

  const hoje = new Date();
  const y = params?.ano && params.ano > 1900 ? params.ano : hoje.getFullYear();
  const m = params?.mes && params.mes >= 1 && params.mes <= 12 ? params.mes - 1 : hoje.getMonth();
  const inicio = new Date(y, m, 1, 0, 0, 0, 0);
  const fim = new Date(y, m + 1, 0, 23, 59, 59, 999);
  const competencia = inicio.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const [classificacoes, movimentos, vendas] = await Promise.all([
    prisma.classificacaoFinanceira.findMany({
      where: { tenantId: scope.tenantId, empresaId: scope.empresaId, ativo: true },
      orderBy: [{ grupo: "asc" }, { nome: "asc" }]
    }),
    prisma.movimentoFinanceiro.findMany({
      where: {
        ...base,
        dataMovimento: { gte: inicio, lte: fim },
        OR: [{ contaPagarId: { not: null } }, { contaReceberId: { not: null } }]
      },
      select: {
        tipo: true,
        valor: true,
        dataMovimento: true,
        contaPagar: {
          select: {
            id: true, descricao: true, numeroDocumento: true, valor: true, juros: true, multa: true,
            descontoBaixa: true, classificacaoId: true,
            fornecedor: { select: { razaoSocial: true, nomeFantasia: true } }
          }
        },
        contaReceber: {
          select: {
            id: true, descricao: true, numeroDocumento: true, valor: true, juros: true, multa: true,
            descontoBaixa: true, classificacaoId: true,
            cliente: { select: { razaoSocial: true, nomeFantasia: true } }
          }
        }
      }
    }),
    prisma.pedidoVenda.findMany({
      where: { ...base, status: { notIn: ["RASCUNHO", "CANCELADO"] }, confirmadoEm: { gte: inicio, lte: fim } },
      select: { total: true }
    })
  ]);

  const porId = new Map<string, ClasseInfo>();
  for (const c of classificacoes) {
    porId.set(c.id, { id: c.id, codigo: c.codigo, nome: c.nome, grupo: c.grupo, ideal: Number(c.orcamentoMensal) });
  }
  const semClassePagar: ClasseInfo = { id: null, codigo: null, nome: SEM_CLASSIFICACAO, grupo: SEM_CLASSIFICACAO, ideal: 0 };

  // Agrega por TÍTULO (conta) — uma linha por título no detalhe, mesmo com várias baixas no mês.
  type TituloAgg = {
    classe: ClasseInfo;
    titulo: string;
    numeroDocumento: string;
    parceiro: string;
    dataBaixa: Date;
    valorTitulo: number;
    jurosMulta: number;
    desconto: number;
    pagoNoMes: number;
  };
  const titulosPagar = new Map<string, TituloAgg>();
  let totalPago = 0;
  let totalRecebido = 0;
  let titulosSemClassificacao = 0;
  const realPorClassePagar = new Map<string | null, { valor: number; titulos: Set<string> }>();
  const realPorClasseReceber = new Map<string | null, { valor: number; titulos: Set<string> }>();

  for (const mov of movimentos) {
    const valor = Number(mov.valor);
    if (mov.tipo === "DEBITO" && mov.contaPagar) {
      const conta = mov.contaPagar;
      totalPago = round2(totalPago + valor);
      const classe = (conta.classificacaoId && porId.get(conta.classificacaoId)) || semClassePagar;
      const aggClasse = realPorClassePagar.get(classe.id) ?? { valor: 0, titulos: new Set<string>() };
      aggClasse.valor = round2(aggClasse.valor + valor);
      aggClasse.titulos.add(conta.id);
      realPorClassePagar.set(classe.id, aggClasse);

      const t = titulosPagar.get(conta.id) ?? {
        classe,
        titulo: conta.descricao,
        numeroDocumento: conta.numeroDocumento ?? "",
        parceiro: conta.fornecedor?.razaoSocial || conta.fornecedor?.nomeFantasia || "—",
        dataBaixa: mov.dataMovimento,
        valorTitulo: Number(conta.valor),
        jurosMulta: round2(Number(conta.juros) + Number(conta.multa)),
        desconto: Number(conta.descontoBaixa),
        pagoNoMes: 0
      };
      t.pagoNoMes = round2(t.pagoNoMes + valor);
      if (mov.dataMovimento > t.dataBaixa) t.dataBaixa = mov.dataMovimento;
      titulosPagar.set(conta.id, t);
    } else if (mov.tipo === "CREDITO" && mov.contaReceber) {
      const conta = mov.contaReceber;
      totalRecebido = round2(totalRecebido + valor);
      const classe = (conta.classificacaoId && porId.get(conta.classificacaoId)) || null;
      const key = classe?.id ?? null;
      const aggClasse = realPorClasseReceber.get(key) ?? { valor: 0, titulos: new Set<string>() };
      aggClasse.valor = round2(aggClasse.valor + valor);
      aggClasse.titulos.add(conta.id);
      realPorClasseReceber.set(key, aggClasse);
    }
  }
  titulosSemClassificacao = realPorClassePagar.get(null)?.titulos.size ?? 0;

  // ── Fechamento (IDEAL × REAL) por grupo ────────────────────────────────────
  const buildGrupos = (
    tipo: "DESPESA" | "RECEITA",
    realPorClasse: Map<string | null, { valor: number; titulos: Set<string> }>
  ): FechamentoGrupo[] => {
    const linhasPorGrupo = new Map<string, FechamentoLinha[]>();
    const push = (grupo: string, linha: FechamentoLinha) => {
      const arr = linhasPorGrupo.get(grupo) ?? [];
      arr.push(linha);
      linhasPorGrupo.set(grupo, arr);
    };
    for (const c of classificacoes) {
      if (c.tipo !== tipo) continue;
      const real = realPorClasse.get(c.id)?.valor ?? 0;
      const ideal = Number(c.orcamentoMensal);
      if (real === 0 && ideal === 0) continue; // sem meta e sem movimento: não polui o fechamento
      push(c.grupo, {
        classificacaoId: c.id,
        codigo: c.codigo,
        nome: c.nome,
        ideal,
        idealFmt: formatBrl(ideal),
        real,
        realFmt: formatBrl(real),
        desvio: ideal > 0 ? round2(real - ideal) : 0,
        desvioFmt: ideal > 0 ? formatBrl(round2(real - ideal)) : "—",
        temMeta: ideal > 0,
        titulos: realPorClasse.get(c.id)?.titulos.size ?? 0
      });
    }
    const semClasse = realPorClasse.get(null);
    if (tipo === "DESPESA" && semClasse && semClasse.valor > 0) {
      push(SEM_CLASSIFICACAO, {
        classificacaoId: null,
        codigo: null,
        nome: SEM_CLASSIFICACAO,
        ideal: 0,
        idealFmt: formatBrl(0),
        real: semClasse.valor,
        realFmt: formatBrl(semClasse.valor),
        desvio: 0,
        desvioFmt: "—",
        temMeta: false,
        titulos: semClasse.titulos.size
      });
    }
    return ordenarGrupos([...linhasPorGrupo.keys()]).map((grupo) => {
      const linhas = linhasPorGrupo.get(grupo) ?? [];
      const ideal = round2(linhas.reduce((s, l) => s + l.ideal, 0));
      const real = round2(linhas.reduce((s, l) => s + l.real, 0));
      return {
        grupo,
        ideal,
        idealFmt: formatBrl(ideal),
        real,
        realFmt: formatBrl(real),
        desvio: round2(real - ideal),
        desvioFmt: formatBrl(round2(real - ideal)),
        linhas: linhas.sort((a, b) => b.real - a.real)
      };
    });
  };

  const despesas = buildGrupos("DESPESA", realPorClassePagar);
  const receitasReceber = buildGrupos("RECEITA", realPorClasseReceber);
  // Recebimentos sem classificação (vendas do PDV etc.) entram como linha informativa.
  const recebidoSemClasse = realPorClasseReceber.get(null);
  if (recebidoSemClasse && recebidoSemClasse.valor > 0) {
    const linha: FechamentoLinha = {
      classificacaoId: null,
      codigo: null,
      nome: "Recebimentos sem classificação",
      ideal: 0,
      idealFmt: formatBrl(0),
      real: recebidoSemClasse.valor,
      realFmt: formatBrl(recebidoSemClasse.valor),
      desvio: 0,
      desvioFmt: "—",
      temMeta: false,
      titulos: recebidoSemClasse.titulos.size
    };
    const grupoReceitas = receitasReceber.find((g) => g.grupo === "Receitas");
    if (grupoReceitas) {
      grupoReceitas.linhas.push(linha);
      grupoReceitas.real = round2(grupoReceitas.real + linha.real);
      grupoReceitas.realFmt = formatBrl(grupoReceitas.real);
      grupoReceitas.desvio = round2(grupoReceitas.real - grupoReceitas.ideal);
      grupoReceitas.desvioFmt = formatBrl(grupoReceitas.desvio);
    } else {
      receitasReceber.push({
        grupo: "Receitas",
        ideal: 0,
        idealFmt: formatBrl(0),
        real: linha.real,
        realFmt: linha.realFmt,
        desvio: linha.real,
        desvioFmt: linha.realFmt,
        linhas: [linha]
      });
    }
  }

  // ── Detalhe: títulos pagos por classificação (espelho do relatório do sistema anterior) ──
  type BlocoAgg = { classe: ClasseInfo; titulos: TituloAgg[] };
  const porClasse = new Map<string | null, BlocoAgg>();
  for (const t of [...titulosPagar.values()].sort((a, b) => a.dataBaixa.getTime() - b.dataBaixa.getTime())) {
    const bloco = porClasse.get(t.classe.id) ?? { classe: t.classe, titulos: [] };
    bloco.titulos.push(t);
    porClasse.set(t.classe.id, bloco);
  }
  const titulosPorClassificacao: ClasseTitulosPagos[] = [...porClasse.values()]
    .map(({ classe, titulos }) => {
      const totalPagoNum = round2(titulos.reduce((s, t) => s + t.pagoNoMes, 0));
      return {
        classificacao: classe.codigo ? `${classe.codigo} - ${classe.nome}` : classe.nome,
        codigo: classe.codigo,
        grupo: classe.grupo,
        registros: titulos.map((t) => ({
          titulo: t.titulo,
          numeroDocumento: t.numeroDocumento,
          dataBaixa: fmtDate(t.dataBaixa),
          parceiro: t.parceiro,
          valorTitulo: formatBrl(t.valorTitulo),
          jurosMulta: formatBrl(t.jurosMulta),
          desconto: formatBrl(t.desconto),
          totalPago: formatBrl(t.pagoNoMes),
          totalPagoNum: t.pagoNoMes
        })),
        totalPago: formatBrl(totalPagoNum),
        totalPagoNum,
        totalJurosMulta: formatBrl(round2(titulos.reduce((s, t) => s + t.jurosMulta, 0))),
        totalDesconto: formatBrl(round2(titulos.reduce((s, t) => s + t.desconto, 0)))
      };
    })
    .sort((a, b) => a.classificacao.localeCompare(b.classificacao, "pt-BR"));

  const totalVendas = round2(vendas.reduce((s, v) => s + Number(v.total), 0));
  const totalIdeal = round2(despesas.reduce((s, g) => s + g.ideal, 0));
  const resultado = round2(totalRecebido - totalPago);

  return {
    competencia,
    inicio: fmtDate(inicio),
    fim: fmtDate(fim),
    temPlano: classificacoes.length > 0,
    resumo: {
      totalPago: formatBrl(totalPago),
      totalPagoNum: totalPago,
      totalRecebido: formatBrl(totalRecebido),
      totalRecebidoNum: totalRecebido,
      totalVendas: formatBrl(totalVendas),
      totalVendasNum: totalVendas,
      resultado: formatBrl(resultado),
      resultadoNum: resultado,
      totalIdeal: formatBrl(totalIdeal),
      totalIdealNum: totalIdeal,
      desvioTotal: formatBrl(round2(totalPago - totalIdeal)),
      desvioTotalNum: round2(totalPago - totalIdeal),
      titulosPagos: titulosPagar.size,
      titulosSemClassificacao
    },
    despesas,
    receitas: receitasReceber,
    titulosPorClassificacao
  };
}

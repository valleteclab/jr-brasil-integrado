import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { ReportsView } from "@/components/erp/ReportsView";
import { accountingPackageReport, apuracaoImpostosReport, salesReport, stockReport, financeReport, fiscalReport, dreSimplificado } from "@/lib/services/reports";
import type { AccountingPackageReport, ApuracaoImpostosReport, SalesReport, StockReport, FinanceReport, FiscalReport, DreSimplificado } from "@/lib/services/reports";
import { livroEntradasReport } from "@/lib/services/livro-entradas";
import type { LivroEntradasReport } from "@/lib/services/livro-entradas";
import { fechamentoMensalReport } from "@/lib/services/fechamento-mensal";
import type { FechamentoMensalReport } from "@/lib/services/fechamento-mensal";
import { getCashFlow } from "@/lib/services/finance";
import type { CashFlowData } from "@/lib/services/finance";
import { financeRankingReport, previstoRealizadoReport } from "@/lib/services/finance-relatorios";
import type { FinanceRankingReport, PrevistoRealizadoReport } from "@/lib/services/finance-relatorios";

export const dynamic = "force-dynamic";

const EMPTY_SALES: SalesReport = {
  periodoDias: 30,
  totalGeral: "R$ 0,00",
  totalGeralNum: 0,
  contagem: 0,
  ticketMedio: "R$ 0,00",
  ticketMedioNum: 0,
  vendasPorDia: [],
  topProdutos: []
};

const EMPTY_STOCK: StockReport = {
  valorTotalEstoque: "R$ 0,00",
  valorTotalEstoqueNum: 0,
  totalSkus: 0,
  totalCriticos: 0,
  totalZerados: 0,
  porCategoria: [],
  itensCriticos: [],
  itensZerados: []
};

const EMPTY_FINANCE: FinanceReport = {
  aReceber: { totalAberto: "R$ 0,00", totalAbertoNum: 0, totalVencido: "R$ 0,00", totalVencidoNum: 0, porStatus: [], aging: [] },
  aPagar: { totalAberto: "R$ 0,00", totalAbertoNum: 0, totalVencido: "R$ 0,00", totalVencidoNum: 0, porStatus: [], aging: [] }
};

const EMPTY_FISCAL: FiscalReport = {
  mes: "",
  totalNotas: 0,
  totalValor: "R$ 0,00",
  totalValorNum: 0,
  totalTributos: "R$ 0,00",
  totalTributosNum: 0,
  linhas: []
};

const EMPTY_DRE: DreSimplificado = {
  periodoDias: 30,
  receitaCaixaFmt: "R$ 0,00",
  receitaCaixaNum: 0,
  receitaCompetenciaFmt: "R$ 0,00",
  receitaCompetenciaNum: 0,
  cmvFmt: "R$ 0,00",
  cmvNum: 0,
  lucroBrutoCaixaFmt: "R$ 0,00",
  lucroBrutoCaixaNum: 0,
  lucroBrutoCompetenciaFmt: "R$ 0,00",
  lucroBrutoCompetenciaNum: 0,
  despesasFmt: "R$ 0,00",
  despesasNum: 0,
  resultadoCaixaFmt: "R$ 0,00",
  resultadoCaixaNum: 0,
  resultadoCompetenciaFmt: "R$ 0,00",
  resultadoCompetenciaNum: 0,
  margemBrutaCaixa: "0.0%",
  margemBrutoCompetencia: "0.0%"
};

const EMPTY_ACCOUNTING: AccountingPackageReport = {
  competencia: "",
  inicio: "",
  fim: "",
  resumo: {
    notasSaida: 0,
    valorSaidas: "R$ 0,00",
    entradasFiscais: 0,
    valorEntradas: "R$ 0,00",
    contasReceber: "R$ 0,00",
    contasPagar: "R$ 0,00",
    valorEstoque: "R$ 0,00",
    pendencias: 0
  },
  fiscalSaidas: [],
  fiscalEntradas: [],
  financeiro: { receber: [], pagar: [] },
  estoque: [],
  checklist: []
};

const EMPTY_LIVRO_ENTRADAS: LivroEntradasReport = {
  competencia: "",
  inicio: "",
  fim: "",
  documentos: 0,
  grupos: [],
  totais: {
    valorContabil: 0,
    baseCalculo: 0,
    imposto: 0,
    isentas: 0,
    outras: 0,
    antecipacao: 0,
    valorContabilFmt: "R$ 0,00",
    baseCalculoFmt: "R$ 0,00",
    impostoFmt: "R$ 0,00",
    isentasFmt: "R$ 0,00",
    outrasFmt: "R$ 0,00",
    antecipacaoFmt: "R$ 0,00"
  },
  avisos: []
};

const EMPTY_FECHAMENTO: FechamentoMensalReport = {
  competencia: "",
  inicio: "",
  fim: "",
  temPlano: false,
  resumo: {
    totalPago: "R$ 0,00",
    totalPagoNum: 0,
    totalRecebido: "R$ 0,00",
    totalRecebidoNum: 0,
    totalVendas: "R$ 0,00",
    totalVendasNum: 0,
    resultado: "R$ 0,00",
    resultadoNum: 0,
    totalIdeal: "R$ 0,00",
    totalIdealNum: 0,
    desvioTotal: "R$ 0,00",
    desvioTotalNum: 0,
    titulosPagos: 0,
    titulosSemClassificacao: 0
  },
  despesas: [],
  receitas: [],
  titulosPorClassificacao: []
};

const EMPTY_CASHFLOW: CashFlowData = {
  projetado30: { label: "30 dias", dias: 30, totalEntradas: 0, totalSaidas: 0, saldo: 0 },
  projetado60: { label: "60 dias", dias: 60, totalEntradas: 0, totalSaidas: 0, saldo: 0 },
  projetado90: { label: "90 dias", dias: 90, totalEntradas: 0, totalSaidas: 0, saldo: 0 },
  realizado30: { totalCreditos: 0, totalDebitos: 0, saldo: 0 },
  dias: [],
  saldoAtualContas: 0
};

const EMPTY_RANKING: FinanceRankingReport = { clientes: [], fornecedores: [] };

const EMPTY_PREVISTO_REALIZADO: PrevistoRealizadoReport = {
  competencia: "",
  receber: { previsto: "R$ 0,00", previstoNum: 0, realizado: "R$ 0,00", realizadoNum: 0, diferenca: "R$ 0,00", diferencaNum: 0, contasPrevistas: 0 },
  pagar: { previsto: "R$ 0,00", previstoNum: 0, realizado: "R$ 0,00", realizadoNum: 0, diferenca: "R$ 0,00", diferencaNum: 0, contasPrevistas: 0 }
};

const EMPTY_APURACAO: ApuracaoImpostosReport = {
  competencia: "",
  inicio: "",
  fim: "",
  regime: "",
  aplicaCredito: false,
  avisoRegime: null,
  linhas: [],
  totais: { creditos: "R$ 0,00", debitos: "R$ 0,00", saldo: "R$ 0,00", saldoNum: 0, aPagar: true },
  retencoes: [],
  totalRetido: "R$ 0,00",
  entradasDetalhe: [],
  saidasDetalhe: [],
  retencoesDetalhe: []
};

export default async function RelatoriosPage({ searchParams }: { searchParams?: { mes?: string; ano?: string } }) {
  let sales: SalesReport = EMPTY_SALES;
  let stock: StockReport = EMPTY_STOCK;
  let finance: FinanceReport = EMPTY_FINANCE;
  let fiscal: FiscalReport = EMPTY_FISCAL;
  let dre: DreSimplificado = EMPTY_DRE;
  let accounting: AccountingPackageReport = EMPTY_ACCOUNTING;
  let apuracao: ApuracaoImpostosReport = EMPTY_APURACAO;
  let livroEntradas: LivroEntradasReport = EMPTY_LIVRO_ENTRADAS;
  let fechamento: FechamentoMensalReport = EMPTY_FECHAMENTO;
  let cashFlow: CashFlowData = EMPTY_CASHFLOW;
  let financeRanking: FinanceRankingReport = EMPTY_RANKING;
  let previstoRealizado: PrevistoRealizadoReport = EMPTY_PREVISTO_REALIZADO;
  const errors: string[] = [];
  const mes = Number(searchParams?.mes);
  const ano = Number(searchParams?.ano);
  const accountingParams = {
    mes: Number.isFinite(mes) ? mes : undefined,
    ano: Number.isFinite(ano) ? ano : undefined
  };

  // Cada relatório isolado para não derrubar os demais
  const [salesResult, stockResult, financeResult, fiscalResult, dreResult, accountingResult, apuracaoResult, livroEntradasResult, fechamentoResult, cashFlowResult, rankingResult, previstoRealizadoResult] = await Promise.allSettled([
    salesReport(30),
    stockReport(),
    financeReport(),
    fiscalReport(),
    dreSimplificado(30),
    accountingPackageReport(accountingParams),
    apuracaoImpostosReport(accountingParams),
    livroEntradasReport(accountingParams),
    fechamentoMensalReport(accountingParams),
    getCashFlow(),
    financeRankingReport(),
    previstoRealizadoReport(accountingParams)
  ]);

  if (salesResult.status === "fulfilled") {
    sales = salesResult.value;
  } else {
    errors.push(`Vendas: ${salesResult.reason instanceof Error ? salesResult.reason.message : "erro desconhecido"}`);
  }

  if (stockResult.status === "fulfilled") {
    stock = stockResult.value;
  } else {
    errors.push(`Estoque: ${stockResult.reason instanceof Error ? stockResult.reason.message : "erro desconhecido"}`);
  }

  if (financeResult.status === "fulfilled") {
    finance = financeResult.value;
  } else {
    errors.push(`Financeiro: ${financeResult.reason instanceof Error ? financeResult.reason.message : "erro desconhecido"}`);
  }

  if (fiscalResult.status === "fulfilled") {
    fiscal = fiscalResult.value;
  } else {
    errors.push(`Fiscal: ${fiscalResult.reason instanceof Error ? fiscalResult.reason.message : "erro desconhecido"}`);
  }

  if (dreResult.status === "fulfilled") {
    dre = dreResult.value;
  } else {
    errors.push(`DRE: ${dreResult.reason instanceof Error ? dreResult.reason.message : "erro desconhecido"}`);
  }

  if (accountingResult.status === "fulfilled") {
    accounting = accountingResult.value;
  } else {
    errors.push(`Pacote contábil: ${accountingResult.reason instanceof Error ? accountingResult.reason.message : "erro desconhecido"}`);
  }

  if (apuracaoResult.status === "fulfilled") {
    apuracao = apuracaoResult.value;
  } else {
    errors.push(`Apuração de impostos: ${apuracaoResult.reason instanceof Error ? apuracaoResult.reason.message : "erro desconhecido"}`);
  }

  if (livroEntradasResult.status === "fulfilled") {
    livroEntradas = livroEntradasResult.value;
  } else {
    errors.push(`Livro de entradas: ${livroEntradasResult.reason instanceof Error ? livroEntradasResult.reason.message : "erro desconhecido"}`);
  }

  if (fechamentoResult.status === "fulfilled") {
    fechamento = fechamentoResult.value;
  } else {
    errors.push(`Fechamento mensal: ${fechamentoResult.reason instanceof Error ? fechamentoResult.reason.message : "erro desconhecido"}`);
  }

  if (cashFlowResult.status === "fulfilled") {
    cashFlow = cashFlowResult.value;
  } else {
    errors.push(`Fluxo de caixa: ${cashFlowResult.reason instanceof Error ? cashFlowResult.reason.message : "erro desconhecido"}`);
  }

  if (rankingResult.status === "fulfilled") {
    financeRanking = rankingResult.value;
  } else {
    errors.push(`Ranking financeiro: ${rankingResult.reason instanceof Error ? rankingResult.reason.message : "erro desconhecido"}`);
  }

  if (previstoRealizadoResult.status === "fulfilled") {
    previstoRealizado = previstoRealizadoResult.value;
  } else {
    errors.push(`Previsto × realizado: ${previstoRealizadoResult.reason instanceof Error ? previstoRealizadoResult.reason.message : "erro desconhecido"}`);
  }

  return (
    <>
      <PageHeader
        eyebrow="Análises"
        title="Relatórios gerenciais"
        action={<Button href="/erp/fiscal/simples" variant="light">Simples Nacional / MEI</Button>}
      >
        <p>Dados em tempo real — período padrão 30 dias para vendas e DRE.</p>
      </PageHeader>

      {errors.length > 0 && (
        <div className="system-error" style={{ marginBottom: "1rem" }}>
          <strong>Alguns relatórios não puderam ser carregados</strong>
          <ul style={{ margin: "0.25rem 0 0 1rem", fontSize: "0.85em" }}>
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      <ReportsView
        sales={sales}
        stock={stock}
        finance={finance}
        fiscal={fiscal}
        dre={dre}
        accounting={accounting}
        apuracao={apuracao}
        livroEntradas={livroEntradas}
        fechamento={fechamento}
        cashFlow={cashFlow}
        financeRanking={financeRanking}
        previstoRealizado={previstoRealizado}
        accountingParams={accountingParams}
      />
    </>
  );
}

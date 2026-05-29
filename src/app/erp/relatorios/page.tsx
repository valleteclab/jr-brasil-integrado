import { PageHeader } from "@/components/shared/PageHeader";
import { ReportsView } from "@/components/erp/ReportsView";
import { salesReport, stockReport, financeReport, fiscalReport, dreSimplificado } from "@/lib/services/reports";
import type { SalesReport, StockReport, FinanceReport, FiscalReport, DreSimplificado } from "@/lib/services/reports";

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

export default async function RelatoriosPage() {
  let sales: SalesReport = EMPTY_SALES;
  let stock: StockReport = EMPTY_STOCK;
  let finance: FinanceReport = EMPTY_FINANCE;
  let fiscal: FiscalReport = EMPTY_FISCAL;
  let dre: DreSimplificado = EMPTY_DRE;
  const errors: string[] = [];

  // Cada relatório isolado para não derrubar os demais
  const [salesResult, stockResult, financeResult, fiscalResult, dreResult] = await Promise.allSettled([
    salesReport(30),
    stockReport(),
    financeReport(),
    fiscalReport(),
    dreSimplificado(30)
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

  return (
    <>
      <PageHeader
        eyebrow="Análises"
        title="Relatórios gerenciais"
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
      />
    </>
  );
}

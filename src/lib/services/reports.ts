import { getDevelopmentTenantScope, scopedByTenantCompany, scopedByTenantCompanyAmbiente, type TenantScope } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { formatBrl } from "@/lib/formatters/currency";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DATE_FMT = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });

function fmtDate(d: Date): string {
  return DATE_FMT.format(new Date(d));
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type VendaDia = {
  data: string;
  contagem: number;
  total: number;
};

export type ProdutoTop = {
  produtoId: string;
  nome: string;
  sku: string;
  quantidadeTotal: number;
  totalVendido: number;
  totalVendidoFmt: string;
};

export type SalesReport = {
  periodoDias: number;
  totalGeral: string;
  totalGeralNum: number;
  contagem: number;
  ticketMedio: string;
  ticketMedioNum: number;
  vendasPorDia: VendaDia[];
  topProdutos: ProdutoTop[];
};

export type StockCategoryRow = {
  categoria: string;
  totalItens: number;
  valorCusto: string;
  valorCustoNum: number;
};

export type StockReport = {
  valorTotalEstoque: string;
  valorTotalEstoqueNum: number;
  totalSkus: number;
  totalCriticos: number;
  totalZerados: number;
  porCategoria: StockCategoryRow[];
  itensCriticos: Array<{
    sku: string;
    nome: string;
    categoria: string;
    saldoAtual: number;
    minimo: number;
    valorCusto: string;
  }>;
  itensZerados: Array<{
    sku: string;
    nome: string;
    categoria: string;
  }>;
};

export type FinanceAgingRow = {
  faixa: string;
  contagem: number;
  total: string;
  totalNum: number;
};

export type FinanceReport = {
  aReceber: {
    totalAberto: string;
    totalAbertoNum: number;
    totalVencido: string;
    totalVencidoNum: number;
    porStatus: Array<{ status: string; contagem: number; total: string; totalNum: number }>;
    aging: FinanceAgingRow[];
  };
  aPagar: {
    totalAberto: string;
    totalAbertoNum: number;
    totalVencido: string;
    totalVencidoNum: number;
    porStatus: Array<{ status: string; contagem: number; total: string; totalNum: number }>;
    aging: FinanceAgingRow[];
  };
};

export type FiscalModeloRow = {
  modelo: string;
  status: string;
  contagem: number;
  valorTotal: string;
  valorTotalNum: number;
  tributos: string;
  tributosNum: number;
};

export type FiscalReport = {
  mes: string;
  totalNotas: number;
  totalValor: string;
  totalValorNum: number;
  totalTributos: string;
  totalTributosNum: number;
  linhas: FiscalModeloRow[];
};

export type DreSimplificado = {
  /**
   * PREMISSAS:
   * - Receita bruta: soma de ContaReceber com status=PAGO no período (baixas realizadas).
   *   Alternativamente, NotaFiscal AUTORIZADA representa a receita reconhecida pelo critério de competência.
   *   Aqui usamos ContaReceber PAGO (regime de caixa) + NotaFiscal AUTORIZADA (competência) lado a lado.
   * - CMV (Custo das Mercadorias Vendidas): soma de custoTotal nos EstoqueMovimento de tipo SAIDA no período.
   * - Despesas operacionais: soma de ContaPagar com status=PAGO no período.
   * - Resultado: Receita (caixa) - CMV - Despesas.
   * - Não considera depreciação, provisões, IR/CSLL ou qualquer ajuste contábil formal.
   *   Este é um DRE gerencial simplificado para acompanhamento operacional.
   */
  periodoDias: number;
  receitaCaixaFmt: string;
  receitaCaixaNum: number;
  receitaCompetenciaFmt: string;
  receitaCompetenciaNum: number;
  cmvFmt: string;
  cmvNum: number;
  lucroBrutoCaixaFmt: string;
  lucroBrutoCaixaNum: number;
  lucroBrutoCompetenciaFmt: string;
  lucroBrutoCompetenciaNum: number;
  despesasFmt: string;
  despesasNum: number;
  resultadoCaixaFmt: string;
  resultadoCaixaNum: number;
  resultadoCompetenciaFmt: string;
  resultadoCompetenciaNum: number;
  margemBrutaCaixa: string;
  margemBrutoCompetencia: string;
};

export type AccountingPackageReport = {
  competencia: string;
  inicio: string;
  fim: string;
  resumo: {
    notasSaida: number;
    valorSaidas: string;
    entradasFiscais: number;
    valorEntradas: string;
    contasReceber: string;
    contasPagar: string;
    valorEstoque: string;
    pendencias: number;
  };
  fiscalSaidas: Array<{
    modelo: string;
    numero: string;
    serie: string;
    status: string;
    destinatario: string;
    documento: string;
    emissao: string;
    total: string;
    tributos: string;
    retencoes: string;
  }>;
  fiscalEntradas: Array<{
    modelo: string;
    numero: string;
    serie: string;
    status: string;
    fornecedor: string;
    chaveAcesso: string;
    emissao: string;
    recebimento: string;
    total: string;
    cfopPrincipal: string;
  }>;
  financeiro: {
    receber: Array<{ documento: string; cliente: string; vencimento: string; status: string; valor: string; valorPago: string }>;
    pagar: Array<{ documento: string; fornecedor: string; vencimento: string; status: string; valor: string; valorPago: string }>;
  };
  estoque: Array<{ tipo: string; produto: string; documento: string; data: string; quantidade: string; custoTotal: string }>;
  checklist: Array<{ status: "ok" | "warn"; item: string; detalhe: string }>;
};

export type LinhaApuracao = {
  tributo: string;
  debito: string;
  credito: string;
  saldo: string;
  debitoNum: number;
  creditoNum: number;
  saldoNum: number;
  situacao: "A pagar" | "Saldo credor" | "Zerado" | "Sem movimento" | "Informativo";
};

export type ApuracaoImpostosReport = {
  competencia: string;
  inicio: string;
  fim: string;
  regime: string;
  aplicaCredito: boolean;
  avisoRegime: string | null;
  linhas: LinhaApuracao[];
  totais: {
    creditos: string;
    debitos: string;
    saldo: string;
    saldoNum: number;
    aPagar: boolean;
  };
  // Retenções na fonte sofridas nas notas de saída (já retidas/recolhidas pelo tomador —
  // antecipações que a empresa não recolhe novamente). ISS retido não compõe o débito.
  retencoes: Array<{ tributo: string; valor: string; valorNum: number }>;
  totalRetido: string;
  entradasDetalhe: Array<{ tributo: string; fornecedor: string; nota: string; emissao: string; valor: string }>;
  saidasDetalhe: Array<{ modelo: string; numero: string; destinatario: string; emissao: string; icms: string; pis: string; cofins: string; ipi: string; iss: string }>;
  retencoesDetalhe: Array<{ nota: string; destinatario: string; emissao: string; irrf: string; pis: string; cofins: string; csll: string; inss: string; iss: string; total: string }>;
};

// ─── Sales Report ─────────────────────────────────────────────────────────────

export async function salesReport(periodoDias = 30, scopeArg?: TenantScope): Promise<SalesReport> {
  const scope = scopeArg ?? (await getDevelopmentTenantScope());
  const base = scopedByTenantCompany(scope);

  const hoje = new Date();
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - periodoDias);
  inicio.setHours(0, 0, 0, 0);

  const pedidos = await prisma.pedidoVenda.findMany({
    where: {
      ...scopedByTenantCompanyAmbiente(scope),
      status: { notIn: ["RASCUNHO", "CANCELADO"] },
      confirmadoEm: { gte: inicio }
    },
    select: {
      id: true,
      total: true,
      confirmadoEm: true,
      itens: {
        select: {
          produtoId: true,
          quantidade: true,
          total: true,
          produto: { select: { nome: true, sku: true } }
        }
      }
    }
  });

  // Vendas por dia
  const mapasDia = new Map<string, { contagem: number; total: number }>();
  for (const p of pedidos) {
    const key = (p.confirmadoEm ?? new Date()).toISOString().substring(0, 10);
    const d = mapasDia.get(key) ?? { contagem: 0, total: 0 };
    d.contagem++;
    d.total = round2(d.total + Number(p.total));
    mapasDia.set(key, d);
  }
  const vendasPorDia: VendaDia[] = Array.from(mapasDia.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({
      data: DATE_FMT.format(new Date(key + "T12:00:00")),
      contagem: v.contagem,
      total: v.total
    }));

  // Top produtos
  const mapaProdutos = new Map<string, { nome: string; sku: string; qty: number; total: number }>();
  for (const p of pedidos) {
    for (const item of p.itens) {
      const existing = mapaProdutos.get(item.produtoId) ?? {
        nome: item.produto.nome,
        sku: item.produto.sku,
        qty: 0,
        total: 0
      };
      existing.qty += Number(item.quantidade);
      existing.total = round2(existing.total + Number(item.total));
      mapaProdutos.set(item.produtoId, existing);
    }
  }
  const topProdutos: ProdutoTop[] = Array.from(mapaProdutos.entries())
    .map(([produtoId, v]) => ({
      produtoId,
      nome: v.nome,
      sku: v.sku,
      quantidadeTotal: v.qty,
      totalVendido: v.total,
      totalVendidoFmt: formatBrl(v.total)
    }))
    .sort((a, b) => b.totalVendido - a.totalVendido)
    .slice(0, 10);

  const totalGeralNum = round2(pedidos.reduce((acc, p) => acc + Number(p.total), 0));
  const contagem = pedidos.length;
  const ticketMedioNum = contagem > 0 ? round2(totalGeralNum / contagem) : 0;

  return {
    periodoDias,
    totalGeral: formatBrl(totalGeralNum),
    totalGeralNum,
    contagem,
    ticketMedio: formatBrl(ticketMedioNum),
    ticketMedioNum,
    vendasPorDia,
    topProdutos
  };
}

// ─── Stock Report ─────────────────────────────────────────────────────────────

export async function stockReport(scopeArg?: TenantScope): Promise<StockReport> {
  const scope = scopeArg ?? (await getDevelopmentTenantScope());
  const base = scopedByTenantCompany(scope);

  const saldos = await prisma.estoqueSaldo.findMany({
    where: { ...base },
    select: {
      quantidade: true,
      minimo: true,
      produto: {
        select: {
          id: true,
          sku: true,
          nome: true,
          custoMedio: true,
          categoria: { select: { nome: true } }
        }
      }
    }
  });

  // Agrega por produto (pode ter múltiplos depósitos)
  const mapaProdutos = new Map<string, {
    sku: string;
    nome: string;
    categoria: string;
    quantidade: number;
    minimo: number;
    custoMedio: number;
  }>();

  for (const s of saldos) {
    const id = s.produto.id;
    const existing = mapaProdutos.get(id);
    if (existing) {
      existing.quantidade += Number(s.quantidade);
      existing.minimo += Number(s.minimo);
    } else {
      mapaProdutos.set(id, {
        sku: s.produto.sku,
        nome: s.produto.nome,
        categoria: s.produto.categoria.nome,
        quantidade: Number(s.quantidade),
        minimo: Number(s.minimo),
        custoMedio: Number(s.produto.custoMedio)
      });
    }
  }

  const produtos = Array.from(mapaProdutos.values());

  // Por categoria
  const mapaCategoria = new Map<string, { totalItens: number; valorCusto: number }>();
  for (const p of produtos) {
    const cat = p.categoria;
    const d = mapaCategoria.get(cat) ?? { totalItens: 0, valorCusto: 0 };
    d.totalItens++;
    d.valorCusto = round2(d.valorCusto + p.quantidade * p.custoMedio);
    mapaCategoria.set(cat, d);
  }
  const porCategoria: StockCategoryRow[] = Array.from(mapaCategoria.entries())
    .map(([categoria, v]) => ({
      categoria,
      totalItens: v.totalItens,
      valorCusto: formatBrl(v.valorCusto),
      valorCustoNum: v.valorCusto
    }))
    .sort((a, b) => b.valorCustoNum - a.valorCustoNum);

  const criticos = produtos.filter((p) => p.minimo > 0 && p.quantidade <= p.minimo && p.quantidade > 0);
  const zerados = produtos.filter((p) => p.quantidade <= 0);

  const valorTotalEstoqueNum = round2(produtos.reduce((acc, p) => acc + p.quantidade * p.custoMedio, 0));

  return {
    valorTotalEstoque: formatBrl(valorTotalEstoqueNum),
    valorTotalEstoqueNum,
    totalSkus: produtos.length,
    totalCriticos: criticos.length,
    totalZerados: zerados.length,
    porCategoria,
    itensCriticos: criticos
      .sort((a, b) => a.quantidade - b.quantidade)
      .map((p) => ({
        sku: p.sku,
        nome: p.nome,
        categoria: p.categoria,
        saldoAtual: p.quantidade,
        minimo: p.minimo,
        valorCusto: formatBrl(p.quantidade * p.custoMedio)
      })),
    itensZerados: zerados.map((p) => ({
      sku: p.sku,
      nome: p.nome,
      categoria: p.categoria
    }))
  };
}

// ─── Finance Report ───────────────────────────────────────────────────────────

export async function financeReport(scopeArg?: TenantScope): Promise<FinanceReport> {
  const scope = scopeArg ?? (await getDevelopmentTenantScope());
  const base = scopedByTenantCompany(scope);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const [receber, pagar] = await Promise.all([
    prisma.contaReceber.findMany({
      where: { ...scopedByTenantCompanyAmbiente(scope), status: { notIn: ["CANCELADO"] } },
      select: { valor: true, valorPago: true, juros: true, multa: true, descontoBaixa: true, vencimento: true, status: true }
    }),
    prisma.contaPagar.findMany({
      where: { ...scopedByTenantCompanyAmbiente(scope), status: { notIn: ["CANCELADO"] } },
      select: { valor: true, valorPago: true, juros: true, multa: true, descontoBaixa: true, vencimento: true, status: true }
    })
  ]);

  function buildAgingAndStatus(rows: typeof receber) {
    const statusMap = new Map<string, { contagem: number; total: number }>();
    const agingMap = new Map<string, { contagem: number; total: number }>();
    let totalAberto = 0;
    let totalVencido = 0;

    for (const r of rows) {
      const saldo = round2(
        Number(r.valor) + Number(r.juros) + Number(r.multa) - Number(r.descontoBaixa) - Number(r.valorPago)
      );

      // Por status
      const st = r.status;
      const sm = statusMap.get(st) ?? { contagem: 0, total: 0 };
      sm.contagem++;
      sm.total = round2(sm.total + saldo);
      statusMap.set(st, sm);

      if (["ABERTO", "PARCIAL", "VENCIDO"].includes(r.status)) {
        totalAberto += saldo;
        const venc = new Date(r.vencimento);
        venc.setHours(0, 0, 0, 0);

        let faixa: string;
        if (venc < hoje) {
          const diasAtraso = Math.floor((hoje.getTime() - venc.getTime()) / 86400000);
          totalVencido += saldo;
          if (diasAtraso <= 30) faixa = "Vencido 1–30 dias";
          else if (diasAtraso <= 60) faixa = "Vencido 31–60 dias";
          else if (diasAtraso <= 90) faixa = "Vencido 61–90 dias";
          else faixa = "Vencido > 90 dias";
        } else {
          const diasAVencer = Math.floor((venc.getTime() - hoje.getTime()) / 86400000);
          if (diasAVencer <= 7) faixa = "Vence em 7 dias";
          else if (diasAVencer <= 30) faixa = "Vence em 8–30 dias";
          else faixa = "Vence em > 30 dias";
        }

        const am = agingMap.get(faixa) ?? { contagem: 0, total: 0 };
        am.contagem++;
        am.total = round2(am.total + saldo);
        agingMap.set(faixa, am);
      }
    }

    const porStatus = Array.from(statusMap.entries()).map(([status, v]) => ({
      status,
      contagem: v.contagem,
      total: formatBrl(v.total),
      totalNum: v.total
    }));

    const agingOrder = [
      "Vencido > 90 dias",
      "Vencido 61–90 dias",
      "Vencido 31–60 dias",
      "Vencido 1–30 dias",
      "Vence em 7 dias",
      "Vence em 8–30 dias",
      "Vence em > 30 dias"
    ];
    const aging: FinanceAgingRow[] = agingOrder
      .filter((f) => agingMap.has(f))
      .map((faixa) => {
        const v = agingMap.get(faixa)!;
        return { faixa, contagem: v.contagem, total: formatBrl(v.total), totalNum: v.total };
      });

    return {
      totalAberto: formatBrl(round2(totalAberto)),
      totalAbertoNum: round2(totalAberto),
      totalVencido: formatBrl(round2(totalVencido)),
      totalVencidoNum: round2(totalVencido),
      porStatus,
      aging
    };
  }

  return {
    aReceber: buildAgingAndStatus(receber),
    aPagar: buildAgingAndStatus(pagar)
  };
}

// ─── Fiscal Report ────────────────────────────────────────────────────────────

export async function fiscalReport(scopeArg?: TenantScope): Promise<FiscalReport> {
  const scope = scopeArg ?? (await getDevelopmentTenantScope());
  const base = scopedByTenantCompany(scope);

  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const fimMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999);

  const notas = await prisma.notaFiscal.findMany({
    where: {
      ...scopedByTenantCompanyAmbiente(scope),
      emitidaEm: { gte: inicioMes, lte: fimMes }
    },
    select: {
      modelo: true,
      status: true,
      total: true,
      valorTotalTributos: true
    }
  });

  const mesStr = agora.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  // Agrupa por modelo + status
  const mapaLinhas = new Map<string, { contagem: number; valorTotal: number; tributos: number }>();
  for (const n of notas) {
    const key = `${n.modelo}||${n.status}`;
    const d = mapaLinhas.get(key) ?? { contagem: 0, valorTotal: 0, tributos: 0 };
    d.contagem++;
    d.valorTotal = round2(d.valorTotal + Number(n.total));
    d.tributos = round2(d.tributos + Number(n.valorTotalTributos));
    mapaLinhas.set(key, d);
  }

  const linhas: FiscalModeloRow[] = Array.from(mapaLinhas.entries())
    .map(([key, v]) => {
      const [modelo, status] = key.split("||");
      return {
        modelo,
        status,
        contagem: v.contagem,
        valorTotal: formatBrl(v.valorTotal),
        valorTotalNum: v.valorTotal,
        tributos: formatBrl(v.tributos),
        tributosNum: v.tributos
      };
    })
    .sort((a, b) => b.valorTotalNum - a.valorTotalNum);

  const totalValorNum = round2(notas.reduce((acc, n) => acc + Number(n.total), 0));
  const totalTributosNum = round2(notas.reduce((acc, n) => acc + Number(n.valorTotalTributos), 0));

  return {
    mes: mesStr,
    totalNotas: notas.length,
    totalValor: formatBrl(totalValorNum),
    totalValorNum,
    totalTributos: formatBrl(totalTributosNum),
    totalTributosNum,
    linhas
  };
}

// ─── DRE Simplificado ─────────────────────────────────────────────────────────

export async function dreSimplificado(periodoDias = 30, scopeArg?: TenantScope): Promise<DreSimplificado> {
  /**
   * PREMISSAS do DRE Gerencial Simplificado:
   * - Receita (regime de caixa): ContaReceber com pagoEm no período (dinheiro efetivamente recebido).
   * - Receita (competência): NotaFiscal AUTORIZADA com autorizadaEm no período (direito reconhecido).
   * - CMV: soma de custoTotal nos EstoqueMovimento de tipo SAIDA no período (custo das mercadorias baixadas).
   * - Despesas operacionais: ContaPagar com pagoEm no período (pagamentos realizados).
   * - Lucro bruto = Receita − CMV.
   * - Resultado líquido = Lucro bruto − Despesas.
   * - NÃO inclui: depreciação, provisões, encargos financeiros, IR/CSLL, ajustes de competência.
   * - Uso exclusivamente gerencial para acompanhamento operacional do período.
   */
  const scope = scopeArg ?? (await getDevelopmentTenantScope());
  const base = scopedByTenantCompany(scope);

  const hoje = new Date();
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - periodoDias);
  inicio.setHours(0, 0, 0, 0);

  const [recebimentos, notasAutorizadas, saidasEstoque, pagamentos] = await Promise.all([
    // Receita caixa: contas recebidas no período
    prisma.contaReceber.findMany({
      where: { ...scopedByTenantCompanyAmbiente(scope), status: "PAGO", pagoEm: { gte: inicio } },
      select: { valor: true, valorPago: true, juros: true, multa: true, descontoBaixa: true }
    }),
    // Receita competência: NF-e autorizadas no período
    prisma.notaFiscal.findMany({
      where: { ...scopedByTenantCompanyAmbiente(scope), status: "AUTORIZADA", autorizadaEm: { gte: inicio } },
      select: { total: true }
    }),
    // CMV: saídas de estoque no período
    prisma.estoqueMovimento.findMany({
      where: { ...base, tipo: "SAIDA", criadoEm: { gte: inicio } },
      select: { custoTotal: true }
    }),
    // Despesas: contas pagas no período
    prisma.contaPagar.findMany({
      where: { ...scopedByTenantCompanyAmbiente(scope), status: "PAGO", pagoEm: { gte: inicio } },
      select: { valor: true, valorPago: true, juros: true, multa: true, descontoBaixa: true }
    })
  ]);

  const receitaCaixaNum = round2(
    recebimentos.reduce((acc, r) => {
      const v = round2(Number(r.valor) + Number(r.juros) + Number(r.multa) - Number(r.descontoBaixa));
      return acc + v;
    }, 0)
  );

  const receitaCompetenciaNum = round2(
    notasAutorizadas.reduce((acc, n) => acc + Number(n.total), 0)
  );

  const cmvNum = round2(
    saidasEstoque.reduce((acc, s) => acc + (s.custoTotal ? Number(s.custoTotal) : 0), 0)
  );

  const despesasNum = round2(
    pagamentos.reduce((acc, p) => {
      const v = round2(Number(p.valor) + Number(p.juros) + Number(p.multa) - Number(p.descontoBaixa));
      return acc + v;
    }, 0)
  );

  const lucroBrutoCaixaNum = round2(receitaCaixaNum - cmvNum);
  const lucroBrutoCompetenciaNum = round2(receitaCompetenciaNum - cmvNum);
  const resultadoCaixaNum = round2(lucroBrutoCaixaNum - despesasNum);
  const resultadoCompetenciaNum = round2(lucroBrutoCompetenciaNum - despesasNum);

  const pctCaixa = receitaCaixaNum > 0 ? round2((lucroBrutoCaixaNum / receitaCaixaNum) * 100) : 0;
  const pctComp = receitaCompetenciaNum > 0 ? round2((lucroBrutoCompetenciaNum / receitaCompetenciaNum) * 100) : 0;

  return {
    periodoDias,
    receitaCaixaFmt: formatBrl(receitaCaixaNum),
    receitaCaixaNum,
    receitaCompetenciaFmt: formatBrl(receitaCompetenciaNum),
    receitaCompetenciaNum,
    cmvFmt: formatBrl(cmvNum),
    cmvNum,
    lucroBrutoCaixaFmt: formatBrl(lucroBrutoCaixaNum),
    lucroBrutoCaixaNum,
    lucroBrutoCompetenciaFmt: formatBrl(lucroBrutoCompetenciaNum),
    lucroBrutoCompetenciaNum,
    despesasFmt: formatBrl(despesasNum),
    despesasNum,
    resultadoCaixaFmt: formatBrl(resultadoCaixaNum),
    resultadoCaixaNum,
    resultadoCompetenciaFmt: formatBrl(resultadoCompetenciaNum),
    resultadoCompetenciaNum,
    margemBrutaCaixa: `${pctCaixa.toFixed(1)}%`,
    margemBrutoCompetencia: `${pctComp.toFixed(1)}%`
  };
}

function monthRange(mes?: number, ano?: number): { inicio: Date; fim: Date; competencia: string } {
  const hoje = new Date();
  const y = ano && ano > 1900 ? ano : hoje.getFullYear();
  const m = mes && mes >= 1 && mes <= 12 ? mes - 1 : hoje.getMonth();
  const inicio = new Date(y, m, 1, 0, 0, 0, 0);
  const fim = new Date(y, m + 1, 0, 23, 59, 59, 999);
  const competencia = inicio.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return { inicio, fim, competencia };
}

function sumMoney<T>(rows: T[], pick: (row: T) => unknown): number {
  return round2(rows.reduce((acc, row) => acc + Number(pick(row) ?? 0), 0));
}

export async function accountingPackageReport(
  params?: { mes?: number; ano?: number },
  scopeArg?: TenantScope
): Promise<AccountingPackageReport> {
  const scope = scopeArg ?? (await getDevelopmentTenantScope());
  const base = scopedByTenantCompany(scope);
  const { inicio, fim, competencia } = monthRange(params?.mes, params?.ano);

  const [notas, entradas, receber, pagar, movimentos, saldos] = await Promise.all([
    prisma.notaFiscal.findMany({
      where: { ...scopedByTenantCompanyAmbiente(scope), emitidaEm: { gte: inicio, lte: fim } },
      orderBy: { emitidaEm: "asc" },
      select: {
        modelo: true,
        numero: true,
        serie: true,
        status: true,
        destinatarioNome: true,
        destinatarioDocumento: true,
        emitidaEm: true,
        total: true,
        valorTotalTributos: true,
        valorRetidoTotal: true,
        xmlUrl: true,
        danfeUrl: true
      }
    }),
    prisma.entradaFiscal.findMany({
      where: { ...scopedByTenantCompanyAmbiente(scope), OR: [{ emitidaEm: { gte: inicio, lte: fim } }, { recebidaEm: { gte: inicio, lte: fim } }] },
      orderBy: [{ emitidaEm: "asc" }, { recebidaEm: "asc" }],
      select: {
        modelo: true,
        numero: true,
        serie: true,
        status: true,
        chaveAcesso: true,
        emitidaEm: true,
        recebidaEm: true,
        totalNota: true,
        cfopPrincipal: true,
        fornecedor: { select: { razaoSocial: true, nomeFantasia: true } }
      }
    }),
    prisma.contaReceber.findMany({
      where: { ...scopedByTenantCompanyAmbiente(scope), vencimento: { gte: inicio, lte: fim } },
      orderBy: { vencimento: "asc" },
      select: {
        numeroDocumento: true,
        descricao: true,
        vencimento: true,
        status: true,
        valor: true,
        valorPago: true,
        cliente: { select: { razaoSocial: true, nomeFantasia: true } }
      }
    }),
    prisma.contaPagar.findMany({
      where: { ...scopedByTenantCompanyAmbiente(scope), vencimento: { gte: inicio, lte: fim } },
      orderBy: { vencimento: "asc" },
      select: {
        numeroDocumento: true,
        descricao: true,
        vencimento: true,
        status: true,
        valor: true,
        valorPago: true,
        fornecedor: { select: { razaoSocial: true, nomeFantasia: true } }
      }
    }),
    prisma.estoqueMovimento.findMany({
      where: { ...base, criadoEm: { gte: inicio, lte: fim } },
      orderBy: { criadoEm: "asc" },
      select: {
        tipo: true,
        documentoTipo: true,
        documentoId: true,
        criadoEm: true,
        quantidade: true,
        custoTotal: true,
        produto: { select: { sku: true, nome: true } }
      }
    }),
    prisma.estoqueSaldo.findMany({
      where: { ...base },
      select: { quantidade: true, produto: { select: { custoMedio: true } } }
    })
  ]);

  const pendencias = [
    { item: "Notas fiscais rejeitadas/erro/processando", count: notas.filter((n) => ["REJEITADA", "ERRO", "PROCESSANDO"].includes(n.status)).length },
    { item: "Notas autorizadas sem XML/PDF", count: notas.filter((n) => n.status === "AUTORIZADA" && !n.xmlUrl && !n.danfeUrl).length },
    { item: "Entradas fiscais aguardando conferência", count: entradas.filter((e) => String(e.status) === "AGUARDANDO_CONFERENCIA").length },
    { item: "Contas a receber vencidas", count: receber.filter((r) => r.status === "VENCIDO").length },
    { item: "Contas a pagar vencidas", count: pagar.filter((p) => p.status === "VENCIDO").length }
  ];
  const valorEstoqueNum = round2(saldos.reduce((acc, s) => acc + Number(s.quantidade) * Number(s.produto.custoMedio), 0));

  return {
    competencia,
    inicio: fmtDate(inicio),
    fim: fmtDate(fim),
    resumo: {
      notasSaida: notas.length,
      valorSaidas: formatBrl(sumMoney(notas, (n) => n.total)),
      entradasFiscais: entradas.length,
      valorEntradas: formatBrl(sumMoney(entradas, (e) => e.totalNota)),
      contasReceber: formatBrl(sumMoney(receber, (r) => r.valor)),
      contasPagar: formatBrl(sumMoney(pagar, (p) => p.valor)),
      valorEstoque: formatBrl(valorEstoqueNum),
      pendencias: pendencias.reduce((acc, p) => acc + p.count, 0)
    },
    fiscalSaidas: notas.map((n) => ({
      modelo: n.modelo,
      numero: n.numero ?? "",
      serie: n.serie ?? "",
      status: n.status,
      destinatario: n.destinatarioNome ?? "",
      documento: n.destinatarioDocumento ?? "",
      emissao: n.emitidaEm ? fmtDate(n.emitidaEm) : "",
      total: formatBrl(Number(n.total)),
      tributos: formatBrl(Number(n.valorTotalTributos)),
      retencoes: formatBrl(Number(n.valorRetidoTotal))
    })),
    fiscalEntradas: entradas.map((e) => ({
      modelo: e.modelo ?? "",
      numero: e.numero ?? "",
      serie: e.serie ?? "",
      status: String(e.status),
      fornecedor: e.fornecedor?.razaoSocial || e.fornecedor?.nomeFantasia || "",
      chaveAcesso: e.chaveAcesso ?? "",
      emissao: e.emitidaEm ? fmtDate(e.emitidaEm) : "",
      recebimento: e.recebidaEm ? fmtDate(e.recebidaEm) : "",
      total: formatBrl(Number(e.totalNota)),
      cfopPrincipal: e.cfopPrincipal ?? ""
    })),
    financeiro: {
      receber: receber.map((r) => ({
        documento: r.numeroDocumento ?? r.descricao,
        cliente: r.cliente.razaoSocial || r.cliente.nomeFantasia || "",
        vencimento: fmtDate(r.vencimento),
        status: r.status,
        valor: formatBrl(Number(r.valor)),
        valorPago: formatBrl(Number(r.valorPago))
      })),
      pagar: pagar.map((p) => ({
        documento: p.numeroDocumento ?? p.descricao,
        fornecedor: p.fornecedor?.razaoSocial || p.fornecedor?.nomeFantasia || "",
        vencimento: fmtDate(p.vencimento),
        status: p.status,
        valor: formatBrl(Number(p.valor)),
        valorPago: formatBrl(Number(p.valorPago))
      }))
    },
    estoque: movimentos.map((m) => ({
      tipo: m.tipo,
      produto: `${m.produto.sku} - ${m.produto.nome}`,
      documento: [m.documentoTipo, m.documentoId].filter(Boolean).join(" "),
      data: fmtDate(m.criadoEm),
      quantidade: Number(m.quantidade).toLocaleString("pt-BR"),
      custoTotal: formatBrl(Number(m.custoTotal ?? 0))
    })),
    checklist: pendencias.map((p) => ({
      status: p.count === 0 ? "ok" : "warn",
      item: p.item,
      detalhe: p.count === 0 ? "Sem pendências" : `${p.count} ocorrência(s)`
    }))
  };
}

// ─── Apuração de impostos (crédito × débito) ────────────────────────────────────

const REGIME_LABEL: Record<string, string> = {
  SIMPLES_NACIONAL: "Simples Nacional",
  SIMPLES_EXCESSO_SUBLIMITE: "Simples Nacional (excesso de sublimite)",
  LUCRO_PRESUMIDO: "Lucro Presumido",
  LUCRO_REAL: "Lucro Real",
  MEI: "MEI"
};

// Regimes que não apropriam crédito de ICMS/PIS/COFINS na entrada (pagam de forma unificada).
const REGIMES_SEM_CREDITO = ["SIMPLES_NACIONAL", "SIMPLES_EXCESSO_SUBLIMITE", "MEI"];

function situacaoApuracao(debito: number, credito: number, saldo: number): LinhaApuracao["situacao"] {
  if (debito === 0 && credito === 0) return "Sem movimento";
  if (saldo > 0.004) return "A pagar";
  if (saldo < -0.004) return "Saldo credor";
  return "Zerado";
}

/**
 * Apuração mensal de impostos: cruza o crédito das entradas (impostos recuperáveis de entradas
 * processadas) com o débito das saídas (notas autorizadas), por tributo. O crédito já vem
 * filtrado por `recuperavel`, que foi gravado conforme o regime na importação — então a soma
 * reflete a regra (no Simples/MEI o crédito é naturalmente zero). ICMS-ST e ISS entram como
 * linhas informativas (não compõem o saldo a pagar dos tributos apuráveis).
 */
export async function apuracaoImpostosReport(
  params?: { mes?: number; ano?: number },
  scopeArg?: TenantScope
): Promise<ApuracaoImpostosReport> {
  const scope = scopeArg ?? (await getDevelopmentTenantScope());
  const base = scopedByTenantCompany(scope);
  const { inicio, fim, competencia } = monthRange(params?.mes, params?.ano);

  const empresa = await prisma.empresa.findUnique({
    where: { id: scope.empresaId },
    select: { regimeTributario: true }
  });
  const regimeKey = empresa?.regimeTributario ?? "SIMPLES_NACIONAL";
  const aplicaCredito = !REGIMES_SEM_CREDITO.includes(regimeKey);
  const avisoRegime = aplicaCredito
    ? null
    : `Empresa no ${REGIME_LABEL[regimeKey] ?? regimeKey}: o imposto é recolhido de forma unificada (DAS). Não há apropriação de crédito de ICMS/PIS/COFINS na entrada — os débitos abaixo são apenas informativos.`;

  const [entradas, saidas] = await Promise.all([
    prisma.entradaFiscal.findMany({
      where: { ...scopedByTenantCompanyAmbiente(scope), status: "ESTOQUE_PROCESSADO", emitidaEm: { gte: inicio, lte: fim } },
      orderBy: { emitidaEm: "asc" },
      select: {
        numero: true,
        emitidaEm: true,
        fornecedor: { select: { razaoSocial: true, nomeFantasia: true } },
        itens: { select: { impostos: { select: { tributo: true, valor: true, recuperavel: true } } } }
      }
    }),
    prisma.notaFiscal.findMany({
      where: { ...scopedByTenantCompanyAmbiente(scope), status: "AUTORIZADA", emitidaEm: { gte: inicio, lte: fim } },
      orderBy: { emitidaEm: "asc" },
      select: {
        modelo: true,
        numero: true,
        destinatarioNome: true,
        emitidaEm: true,
        valorIcms: true,
        valorIcmsSt: true,
        valorPis: true,
        valorCofins: true,
        valorIpi: true,
        valorIss: true,
        issRetido: true,
        valorIrRetido: true,
        valorPisRetido: true,
        valorCofinsRetido: true,
        valorCsllRetido: true,
        valorInssRetido: true
      }
    })
  ]);

  // Créditos por tributo (somente recuperáveis e quando o regime permite).
  const credito: Record<string, number> = { ICMS: 0, PIS: 0, COFINS: 0, IPI: 0 };
  const entradasDetalhe: ApuracaoImpostosReport["entradasDetalhe"] = [];
  for (const entrada of entradas) {
    const fornecedor = entrada.fornecedor?.razaoSocial || entrada.fornecedor?.nomeFantasia || "—";
    for (const item of entrada.itens) {
      for (const imp of item.impostos) {
        if (!imp.recuperavel || !aplicaCredito) continue;
        if (!(imp.tributo in credito)) continue;
        const valor = Number(imp.valor ?? 0);
        credito[imp.tributo] = round2(credito[imp.tributo] + valor);
        entradasDetalhe.push({
          tributo: imp.tributo,
          fornecedor,
          nota: entrada.numero ?? "—",
          emissao: entrada.emitidaEm ? fmtDate(entrada.emitidaEm) : "—",
          valor: formatBrl(valor)
        });
      }
    }
  }

  // Débitos por tributo (saídas autorizadas). O ISS retido na fonte NÃO é débito a recolher
  // (quem recolhe é o tomador) — entra nas retenções, não no débito de ISS.
  const debito = {
    ICMS: sumMoney(saidas, (n) => n.valorIcms),
    PIS: sumMoney(saidas, (n) => n.valorPis),
    COFINS: sumMoney(saidas, (n) => n.valorCofins),
    IPI: sumMoney(saidas, (n) => n.valorIpi),
    ISS: sumMoney(saidas.filter((n) => !n.issRetido), (n) => n.valorIss),
    ICMS_ST: sumMoney(saidas, (n) => n.valorIcmsSt)
  };

  // Retenções na fonte sofridas nas saídas (já recolhidas pelo tomador). ISS retido = valorIss
  // das notas com issRetido. As federais são antecipações compensáveis na apuração da empresa.
  const retido = {
    IRRF: sumMoney(saidas, (n) => n.valorIrRetido),
    PIS: sumMoney(saidas, (n) => n.valorPisRetido),
    COFINS: sumMoney(saidas, (n) => n.valorCofinsRetido),
    CSLL: sumMoney(saidas, (n) => n.valorCsllRetido),
    INSS: sumMoney(saidas, (n) => n.valorInssRetido),
    ISS: sumMoney(saidas.filter((n) => n.issRetido), (n) => n.valorIss)
  };

  const apuraveis: Array<{ tributo: string; debito: number; credito: number }> = [
    { tributo: "ICMS", debito: debito.ICMS, credito: credito.ICMS },
    { tributo: "PIS", debito: debito.PIS, credito: credito.PIS },
    { tributo: "COFINS", debito: debito.COFINS, credito: credito.COFINS },
    { tributo: "IPI", debito: debito.IPI, credito: credito.IPI }
  ];

  const linhas: LinhaApuracao[] = apuraveis.map(({ tributo, debito: d, credito: c }) => {
    const saldo = round2(d - c);
    return {
      tributo,
      debito: formatBrl(d),
      credito: formatBrl(c),
      saldo: formatBrl(Math.abs(saldo)),
      debitoNum: d,
      creditoNum: c,
      saldoNum: saldo,
      situacao: situacaoApuracao(d, c, saldo)
    };
  });

  // Linhas informativas (não entram no saldo total).
  const informativas: Array<{ tributo: string; valor: number }> = [
    { tributo: "ISS a recolher (não retido)", valor: debito.ISS },
    { tributo: "ICMS-ST (recolhido à parte)", valor: debito.ICMS_ST }
  ];
  for (const inf of informativas) {
    if (inf.valor <= 0) continue;
    linhas.push({
      tributo: inf.tributo,
      debito: formatBrl(inf.valor),
      credito: formatBrl(0),
      saldo: formatBrl(inf.valor),
      debitoNum: inf.valor,
      creditoNum: 0,
      saldoNum: inf.valor,
      situacao: "Informativo"
    });
  }

  const totalCreditos = round2(apuraveis.reduce((acc, l) => acc + l.credito, 0));
  const totalDebitos = round2(apuraveis.reduce((acc, l) => acc + l.debito, 0));
  const saldoTotal = round2(totalDebitos - totalCreditos);

  // Retenções por tributo (só as que tiveram valor no período).
  const retencoes = [
    { tributo: "IRRF", valor: retido.IRRF },
    { tributo: "PIS retido", valor: retido.PIS },
    { tributo: "COFINS retido", valor: retido.COFINS },
    { tributo: "CSLL", valor: retido.CSLL },
    { tributo: "INSS", valor: retido.INSS },
    { tributo: "ISS retido", valor: retido.ISS }
  ].filter((r) => r.valor > 0).map((r) => ({ tributo: r.tributo, valor: formatBrl(r.valor), valorNum: r.valor }));
  const totalRetido = round2(retencoes.reduce((acc, r) => acc + r.valorNum, 0));

  // Detalhe de retenções por nota (apenas notas que tiveram alguma retenção).
  const retencoesDetalhe = saidas
    .map((n) => {
      const issRet = n.issRetido ? Number(n.valorIss ?? 0) : 0;
      const total = round2(
        Number(n.valorIrRetido ?? 0) + Number(n.valorPisRetido ?? 0) + Number(n.valorCofinsRetido ?? 0) +
        Number(n.valorCsllRetido ?? 0) + Number(n.valorInssRetido ?? 0) + issRet
      );
      return { n, issRet, total };
    })
    .filter((x) => x.total > 0)
    .map(({ n, issRet, total }) => ({
      nota: `${n.modelo} ${n.numero ?? "—"}`,
      destinatario: n.destinatarioNome ?? "—",
      emissao: n.emitidaEm ? fmtDate(n.emitidaEm) : "—",
      irrf: formatBrl(Number(n.valorIrRetido ?? 0)),
      pis: formatBrl(Number(n.valorPisRetido ?? 0)),
      cofins: formatBrl(Number(n.valorCofinsRetido ?? 0)),
      csll: formatBrl(Number(n.valorCsllRetido ?? 0)),
      inss: formatBrl(Number(n.valorInssRetido ?? 0)),
      iss: formatBrl(issRet),
      total: formatBrl(total)
    }));

  return {
    competencia,
    inicio: fmtDate(inicio),
    fim: fmtDate(fim),
    regime: REGIME_LABEL[regimeKey] ?? regimeKey,
    aplicaCredito,
    avisoRegime,
    linhas,
    totais: {
      creditos: formatBrl(totalCreditos),
      debitos: formatBrl(totalDebitos),
      saldo: formatBrl(Math.abs(saldoTotal)),
      saldoNum: saldoTotal,
      aPagar: saldoTotal >= 0
    },
    retencoes,
    totalRetido: formatBrl(totalRetido),
    entradasDetalhe,
    saidasDetalhe: saidas.map((n) => ({
      modelo: n.modelo,
      numero: n.numero ?? "—",
      destinatario: n.destinatarioNome ?? "—",
      emissao: n.emitidaEm ? fmtDate(n.emitidaEm) : "—",
      icms: formatBrl(Number(n.valorIcms ?? 0)),
      pis: formatBrl(Number(n.valorPis ?? 0)),
      cofins: formatBrl(Number(n.valorCofins ?? 0)),
      ipi: formatBrl(Number(n.valorIpi ?? 0)),
      iss: formatBrl(Number(n.valorIss ?? 0))
    })),
    retencoesDetalhe
  };
}


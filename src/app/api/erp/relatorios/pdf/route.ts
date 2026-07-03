import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { gerarRelatorioPdf, type RelatorioPdfInput, type RelatorioSecao } from "@/lib/pdf/relatorio-pdf";
import { salesReport, stockReport, financeReport, fiscalReport, dreSimplificado } from "@/lib/services/reports";
import { getCashFlow } from "@/lib/services/finance";
import { fechamentoMensalReport } from "@/lib/services/fechamento-mensal";
import { financeRankingReport, previstoRealizadoReport } from "@/lib/services/finance-relatorios";

/**
 * RELATÓRIOS EM PDF (com o logotipo do cliente no cabeçalho) — um endpoint por tipo:
 * vendas | estoque | financeiro | fiscal | dre | fluxo-caixa | fechamento | ranking | previsto.
 * Parâmetros: dias (relatórios por período corrido) ou mes/ano (competência).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(v);
const qtd = (v: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v);

async function dadosEmpresa(empresaId: string) {
  const [empresa, config] = await Promise.all([
    prisma.empresa.findUnique({ where: { id: empresaId }, select: { razaoSocial: true, cnpj: true } }),
    prisma.configuracaoFiscal.findUnique({ where: { empresaId }, select: { logotipoInfo: true } })
  ]);
  return {
    razaoSocial: empresa?.razaoSocial ?? "Empresa",
    cnpj: empresa?.cnpj ?? null,
    logoDataUrl: config?.logotipoInfo ?? null
  };
}

export async function GET(request: Request) {
  try {
    await requireModulo("relatorios");
    const scope = await getDevelopmentTenantScope();
    const url = new URL(request.url);
    const tipo = url.searchParams.get("tipo") ?? "";
    const dias = Math.max(1, Math.min(365, Number(url.searchParams.get("dias") ?? 30) || 30));
    const hoje = new Date();
    const mes = Math.max(1, Math.min(12, Number(url.searchParams.get("mes") ?? hoje.getMonth() + 1) || hoje.getMonth() + 1));
    const ano = Math.max(2000, Number(url.searchParams.get("ano") ?? hoje.getFullYear()) || hoje.getFullYear());
    const competencia = `${String(mes).padStart(2, "0")}/${ano}`;

    const empresa = await dadosEmpresa(scope.empresaId);
    let input: RelatorioPdfInput | null = null;

    if (tipo === "vendas") {
      const r = await salesReport(dias);
      input = {
        titulo: "Relatório de Vendas",
        subtitulo: `Últimos ${r.periodoDias} dias`,
        empresa,
        kpis: [
          { label: "Total vendido", valor: r.totalGeral },
          { label: "Vendas", valor: String(r.contagem) },
          { label: "Ticket médio", valor: r.ticketMedio }
        ],
        secoes: [
          {
            titulo: "Vendas por dia",
            tabela: {
              colunas: [{ label: "Data", peso: 2 }, { label: "Vendas", align: "right" }, { label: "Total", align: "right", peso: 2 }],
              linhas: r.vendasPorDia.map((d) => [d.data, String(d.contagem), brl(d.total)]),
              total: ["Total", String(r.contagem), r.totalGeral]
            }
          },
          {
            titulo: "Produtos mais vendidos",
            tabela: {
              colunas: [{ label: "SKU", peso: 1.2 }, { label: "Produto", peso: 3 }, { label: "Qtd.", align: "right" }, { label: "Total", align: "right", peso: 1.4 }],
              linhas: r.topProdutos.map((p) => [p.sku, p.nome, qtd(p.quantidadeTotal), p.totalVendidoFmt])
            }
          }
        ],
        rodape: "Relatório de vendas"
      };
    } else if (tipo === "estoque") {
      const r = await stockReport();
      input = {
        titulo: "Relatório de Estoque",
        subtitulo: "Posição atual",
        empresa,
        kpis: [
          { label: "Valor em estoque", valor: r.valorTotalEstoque },
          { label: "SKUs ativos", valor: String(r.totalSkus) },
          { label: "Abaixo do mínimo", valor: String(r.totalCriticos) },
          { label: "Zerados", valor: String(r.totalZerados) }
        ],
        secoes: [
          {
            titulo: "Por categoria",
            tabela: {
              colunas: [{ label: "Categoria", peso: 3 }, { label: "Itens", align: "right" }, { label: "Valor (custo)", align: "right", peso: 1.6 }],
              linhas: r.porCategoria.map((c) => [c.categoria, String(c.totalItens), c.valorCusto]),
              total: ["Total", String(r.totalSkus), r.valorTotalEstoque]
            }
          },
          {
            titulo: "Itens abaixo do estoque mínimo",
            tabela: {
              colunas: [{ label: "SKU", peso: 1.2 }, { label: "Produto", peso: 3 }, { label: "Saldo", align: "right" }, { label: "Mínimo", align: "right" }],
              linhas: r.itensCriticos.map((i) => [i.sku, i.nome, qtd(i.saldoAtual), qtd(i.minimo)])
            }
          }
        ],
        rodape: "Relatório de estoque"
      };
    } else if (tipo === "financeiro") {
      const r = await financeReport();
      const lado = (nome: string, l: typeof r.aReceber): RelatorioSecao[] => [
        {
          titulo: `${nome} — aging (dias em atraso/à vencer)`,
          tabela: {
            colunas: [{ label: "Faixa", peso: 2.4 }, { label: "Títulos", align: "right" }, { label: "Total", align: "right", peso: 1.6 }],
            linhas: l.aging.map((a) => [a.faixa, String(a.contagem), a.total])
          }
        },
        {
          tabela: {
            colunas: [{ label: "Situação", peso: 2.4 }, { label: "Títulos", align: "right" }, { label: "Total", align: "right", peso: 1.6 }],
            linhas: l.porStatus.map((s) => [s.status, String(s.contagem), s.total])
          }
        }
      ];
      input = {
        titulo: "Relatório Financeiro (aging)",
        subtitulo: "Posição atual de contas a receber e a pagar",
        empresa,
        kpis: [
          { label: "A receber em aberto", valor: r.aReceber.totalAberto },
          { label: "A receber vencido", valor: r.aReceber.totalVencido },
          { label: "A pagar em aberto", valor: r.aPagar.totalAberto },
          { label: "A pagar vencido", valor: r.aPagar.totalVencido }
        ],
        secoes: [...lado("A receber", r.aReceber), ...lado("A pagar", r.aPagar)],
        rodape: "Relatório financeiro"
      };
    } else if (tipo === "fiscal") {
      const r = await fiscalReport(); // mês corrente (mesma base da aba Fiscal)
      input = {
        titulo: "Relatório Fiscal",
        subtitulo: `Competência ${r.mes || competencia}`,
        empresa,
        kpis: [
          { label: "Notas emitidas", valor: String(r.totalNotas) },
          { label: "Valor total", valor: r.totalValor },
          { label: "Tributos destacados", valor: r.totalTributos }
        ],
        secoes: [
          {
            titulo: "Por modelo e situação",
            tabela: {
              colunas: [{ label: "Modelo" }, { label: "Situação", peso: 1.6 }, { label: "Notas", align: "right" }, { label: "Valor", align: "right", peso: 1.4 }, { label: "Tributos", align: "right", peso: 1.4 }],
              linhas: r.linhas.map((l) => [l.modelo, l.status, String(l.contagem), l.valorTotal, l.tributos]),
              total: ["Total", "", String(r.totalNotas), r.totalValor, r.totalTributos]
            }
          }
        ],
        rodape: "Relatório fiscal"
      };
    } else if (tipo === "dre") {
      const r = await dreSimplificado(dias);
      input = {
        titulo: "DRE Simplificado",
        subtitulo: `Últimos ${r.periodoDias} dias · caixa × competência`,
        empresa,
        kpis: [
          { label: "Receita (caixa)", valor: r.receitaCaixaFmt },
          { label: "Receita (competência)", valor: r.receitaCompetenciaFmt },
          { label: "Resultado (caixa)", valor: r.resultadoCaixaFmt },
          { label: "Margem bruta (caixa)", valor: r.margemBrutaCaixa }
        ],
        secoes: [
          {
            titulo: "Demonstrativo",
            tabela: {
              colunas: [{ label: "Linha", peso: 2.6 }, { label: "Caixa", align: "right", peso: 1.4 }, { label: "Competência", align: "right", peso: 1.4 }],
              linhas: [
                ["Receita bruta", r.receitaCaixaFmt, r.receitaCompetenciaFmt],
                ["(-) CMV", r.cmvFmt, r.cmvFmt],
                ["Lucro bruto", r.lucroBrutoCaixaFmt, r.lucroBrutoCompetenciaFmt],
                ["(-) Despesas pagas", r.despesasFmt, r.despesasFmt],
                ["Resultado", r.resultadoCaixaFmt, r.resultadoCompetenciaFmt]
              ]
            }
          },
          { texto: "Caixa = recebimentos/pagamentos efetivados no período. Competência = notas autorizadas. CMV = custo das saídas de estoque." }
        ],
        rodape: "DRE simplificado (gerencial)"
      };
    } else if (tipo === "fluxo-caixa") {
      const r = await getCashFlow();
      input = {
        titulo: "Fluxo de Caixa Projetado",
        subtitulo: "Contas em aberto por vencimento + saldo das contas",
        empresa,
        kpis: [
          { label: "Saldo atual (contas)", valor: brl(r.saldoAtualContas) },
          { label: "Projeção 30 dias", valor: brl(r.projetado30.saldo) },
          { label: "Projeção 60 dias", valor: brl(r.projetado60.saldo) },
          { label: "Projeção 90 dias", valor: brl(r.projetado90.saldo) }
        ],
        secoes: [
          {
            titulo: "Próximos vencimentos (dia a dia)",
            tabela: {
              colunas: [{ label: "Data", peso: 1.4 }, { label: "Entradas", align: "right", peso: 1.4 }, { label: "Saídas", align: "right", peso: 1.4 }, { label: "Saldo do dia", align: "right", peso: 1.4 }, { label: "Acumulado", align: "right", peso: 1.4 }],
              linhas: r.dias.slice(0, 45).map((d) => [d.data, brl(d.entradas), brl(d.saidas), brl(d.saldoDia), brl(d.saldoAcumulado)])
            }
          }
        ],
        rodape: "Fluxo de caixa projetado"
      };
    } else if (tipo === "fechamento") {
      const r = await fechamentoMensalReport({ mes, ano });
      const grupoSecao = (titulo: string, grupos: typeof r.despesas): RelatorioSecao => ({
        titulo,
        tabela: {
          colunas: [{ label: "Grupo / classe", peso: 3 }, { label: "Meta (ideal)", align: "right", peso: 1.3 }, { label: "Real", align: "right", peso: 1.3 }, { label: "Desvio", align: "right", peso: 1.3 }],
          linhas: grupos.flatMap((g) => [
            [g.grupo.toUpperCase(), g.idealFmt, g.realFmt, g.desvioFmt],
            ...g.linhas.map((l) => [`   ${l.nome}`, l.idealFmt, l.realFmt, l.temMeta ? l.desvioFmt : "—"])
          ])
        }
      });
      input = {
        titulo: "Fechamento Mensal (IDEAL × REAL)",
        subtitulo: `Competência ${r.competencia}`,
        empresa,
        kpis: [
          { label: "Recebido", valor: r.resumo.totalRecebido },
          { label: "Pago", valor: r.resumo.totalPago },
          { label: "Resultado", valor: r.resumo.resultado },
          { label: "Desvio vs meta", valor: r.resumo.desvioTotal }
        ],
        secoes: [
          grupoSecao("Despesas por grupo", r.despesas),
          grupoSecao("Receitas", r.receitas),
          ...(r.resumo.titulosSemClassificacao > 0
            ? [{ texto: `Atenção: ${r.resumo.titulosSemClassificacao} título(s) pagos sem classificação — classifique no Financeiro para o fechamento ficar completo.` }]
            : [])
        ],
        rodape: "Fechamento mensal gerencial"
      };
    } else if (tipo === "ranking") {
      const r = await financeRankingReport();
      const tabela = (linhas: typeof r.clientes) => ({
        colunas: [{ label: "Nome", peso: 3 }, { label: "Títulos", align: "right" as const }, { label: "Em aberto", align: "right" as const, peso: 1.4 }, { label: "Vencido", align: "right" as const, peso: 1.4 }],
        linhas: linhas.map((l) => [l.nome, String(l.contas), l.total, l.vencido])
      });
      input = {
        titulo: "Ranking Financeiro",
        subtitulo: "Maiores saldos em aberto por cliente e por fornecedor",
        empresa,
        secoes: [
          { titulo: "A receber por cliente", tabela: tabela(r.clientes) },
          { titulo: "A pagar por fornecedor", tabela: tabela(r.fornecedores) }
        ],
        rodape: "Ranking financeiro"
      };
    } else if (tipo === "previsto") {
      const r = await previstoRealizadoReport({ mes, ano });
      input = {
        titulo: "Previsto × Realizado",
        subtitulo: `Competência ${r.competencia}`,
        empresa,
        kpis: [
          { label: "Previsto a receber", valor: r.receber.previsto },
          { label: "Recebido", valor: r.receber.realizado },
          { label: "Previsto a pagar", valor: r.pagar.previsto },
          { label: "Pago", valor: r.pagar.realizado }
        ],
        secoes: [
          {
            titulo: "Resumo do mês",
            tabela: {
              colunas: [{ label: "Lado", peso: 1.6 }, { label: "Previsto", align: "right", peso: 1.4 }, { label: "Realizado", align: "right", peso: 1.4 }, { label: "Diferença", align: "right", peso: 1.4 }, { label: "Títulos previstos", align: "right", peso: 1.2 }],
              linhas: [
                ["A receber", r.receber.previsto, r.receber.realizado, r.receber.diferenca, String(r.receber.contasPrevistas)],
                ["A pagar", r.pagar.previsto, r.pagar.realizado, r.pagar.diferenca, String(r.pagar.contasPrevistas)]
              ]
            }
          },
          { texto: "Previsto = títulos com vencimento no mês (saldo integral). Realizado = baixas efetivadas no mês, na data da baixa." }
        ],
        rodape: "Previsto × realizado"
      };
    }

    if (!input) {
      return NextResponse.json({ error: `Tipo de relatório inválido: "${tipo}".` }, { status: 400 });
    }

    const pdf = await gerarRelatorioPdf(input);
    const nomeArquivo = `${tipo}-${competencia.replace("/", "-")}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="relatorio-${nomeArquivo}"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível gerar o PDF do relatório.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

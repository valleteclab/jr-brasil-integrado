import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { financeReport } from "@/lib/services/reports";
import { getCashFlow } from "@/lib/services/finance";
import { financeRankingReport, previstoRealizadoReport } from "@/lib/services/finance-relatorios";

function paramsFromUrl(request: Request): { mes?: number; ano?: number } {
  const url = new URL(request.url);
  const mes = Number(url.searchParams.get("mes"));
  const ano = Number(url.searchParams.get("ano"));
  return { mes: Number.isFinite(mes) ? mes : undefined, ano: Number.isFinite(ano) ? ano : undefined };
}

function esc(value: string): string {
  return /[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV do relatório financeiro: fluxo projetado, previsto×realizado, ranking e aging (Excel pt-BR, ;). */
export async function GET(request: Request) {
  try {
    await requireModulo("relatorios");
    const params = paramsFromUrl(request);
    const [finance, cashFlow, ranking, pr] = await Promise.all([
      financeReport(),
      getCashFlow(),
      financeRankingReport(),
      previstoRealizadoReport(params)
    ]);

    const linhas: string[] = [];
    linhas.push("RELATORIO FINANCEIRO - CONTAS A PAGAR/RECEBER;;;");
    linhas.push(";;;");
    linhas.push("FLUXO DE CAIXA PROJETADO;ENTRADAS;SAIDAS;SALDO PROJETADO");
    linhas.push([esc("Saldo atual em contas"), "", "", cashFlow.saldoAtualContas.toFixed(2)].join(";"));
    for (const p of [cashFlow.projetado30, cashFlow.projetado60, cashFlow.projetado90]) {
      linhas.push([esc(p.label), p.totalEntradas.toFixed(2), p.totalSaidas.toFixed(2), (cashFlow.saldoAtualContas + p.saldo).toFixed(2)].join(";"));
    }
    linhas.push(";;;");
    linhas.push(`PREVISTO X REALIZADO;${esc(pr.competencia)};;`);
    linhas.push("LADO;PREVISTO;REALIZADO;DIFERENCA");
    linhas.push(["A RECEBER", pr.receber.previstoNum.toFixed(2), pr.receber.realizadoNum.toFixed(2), pr.receber.diferencaNum.toFixed(2)].join(";"));
    linhas.push(["A PAGAR", pr.pagar.previstoNum.toFixed(2), pr.pagar.realizadoNum.toFixed(2), pr.pagar.diferencaNum.toFixed(2)].join(";"));
    linhas.push(";;;");
    linhas.push("A RECEBER POR CLIENTE;CONTAS;EM ABERTO;VENCIDO");
    for (const r of ranking.clientes) linhas.push([esc(r.nome), String(r.contas), r.totalNum.toFixed(2), r.vencidoNum.toFixed(2)].join(";"));
    linhas.push(";;;");
    linhas.push("A PAGAR POR FORNECEDOR;CONTAS;EM ABERTO;VENCIDO");
    for (const r of ranking.fornecedores) linhas.push([esc(r.nome), String(r.contas), r.totalNum.toFixed(2), r.vencidoNum.toFixed(2)].join(";"));
    linhas.push(";;;");
    linhas.push("AGING A RECEBER;QTD;TOTAL;");
    for (const a of finance.aReceber.aging) linhas.push([esc(a.faixa), String(a.contagem), a.totalNum.toFixed(2), ""].join(";"));
    linhas.push(";;;");
    linhas.push("AGING A PAGAR;QTD;TOTAL;");
    for (const a of finance.aPagar.aging) linhas.push([esc(a.faixa), String(a.contagem), a.totalNum.toFixed(2), ""].join(";"));

    return new NextResponse(`﻿${linhas.join("\n")}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="relatorio-financeiro.csv"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar o relatório financeiro em CSV.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 500) });
  }
}

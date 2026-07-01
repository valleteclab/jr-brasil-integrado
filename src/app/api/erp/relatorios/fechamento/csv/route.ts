import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { fechamentoMensalReport } from "@/lib/services/fechamento-mensal";
import type { FechamentoGrupo, FechamentoMensalReport } from "@/lib/services/fechamento-mensal";

function paramsFromUrl(request: Request): { mes?: number; ano?: number } {
  const url = new URL(request.url);
  const mes = Number(url.searchParams.get("mes"));
  const ano = Number(url.searchParams.get("ano"));
  return { mes: Number.isFinite(mes) ? mes : undefined, ano: Number.isFinite(ano) ? ano : undefined };
}

function esc(value: string): string {
  return /[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function gruposCsv(linhas: string[], grupos: FechamentoGrupo[]) {
  for (const g of grupos) {
    linhas.push(`${esc(g.grupo.toUpperCase())};;;`);
    for (const l of g.linhas) {
      linhas.push([esc(l.codigo ? `${l.codigo} - ${l.nome}` : l.nome), l.temMeta ? l.ideal.toFixed(2) : "", l.real.toFixed(2), l.temMeta ? l.desvio.toFixed(2) : ""].join(";"));
    }
    linhas.push([esc(`TOTAL ${g.grupo}`), g.ideal.toFixed(2), g.real.toFixed(2), g.desvio.toFixed(2)].join(";"));
    linhas.push(";;;");
  }
}

/** CSV do fechamento (IDEAL × REAL por classificação + detalhe de títulos pagos) — formato Excel pt-BR (;). */
function fechamentoCsv(r: FechamentoMensalReport): string {
  const linhas: string[] = [];
  linhas.push(`FECHAMENTO MENSAL;${esc(r.competencia)};${r.inicio} a ${r.fim};`);
  linhas.push(";;;");
  linhas.push("CLASSIFICACAO;IDEAL;REAL;DESVIO");
  gruposCsv(linhas, r.despesas);
  linhas.push([esc("TOTAL DE GASTOS"), r.resumo.totalIdealNum.toFixed(2), r.resumo.totalPagoNum.toFixed(2), r.resumo.desvioTotalNum.toFixed(2)].join(";"));
  linhas.push(";;;");
  if (r.receitas.length) {
    linhas.push("RECEITAS;;REAL;");
    gruposCsv(linhas, r.receitas);
  }
  linhas.push([esc("TOTAL DE VENDAS"), "", r.resumo.totalVendasNum.toFixed(2), ""].join(";"));
  linhas.push([esc("TOTAL DE ENTRADAS (recebido)"), "", r.resumo.totalRecebidoNum.toFixed(2), ""].join(";"));
  linhas.push([esc("TOTAL DE SAIDAS (pago)"), "", r.resumo.totalPagoNum.toFixed(2), ""].join(";"));
  linhas.push([esc("RESULTADO (caixa)"), "", r.resumo.resultadoNum.toFixed(2), ""].join(";"));
  linhas.push(";;;");
  linhas.push("TITULOS PAGOS POR CLASSIFICACAO;;;");
  linhas.push("CLASSIFICACAO;TITULO;N DOC;PARCEIRO;DATA BAIXA;VALOR TITULO;JUROS+MULTA;DESCONTO;TOTAL PAGO");
  for (const bloco of r.titulosPorClassificacao) {
    for (const t of bloco.registros) {
      linhas.push([
        esc(bloco.classificacao), esc(t.titulo), esc(t.numeroDocumento), esc(t.parceiro), t.dataBaixa,
        t.valorTitulo, t.jurosMulta, t.desconto, t.totalPago
      ].join(";"));
    }
    linhas.push([esc(`SUBTOTAL ${bloco.classificacao}`), "", "", "", "", "", bloco.totalJurosMulta, bloco.totalDesconto, bloco.totalPago].join(";"));
  }
  return linhas.join("\n");
}

export async function GET(request: Request) {
  try {
    await requireModulo("relatorios");
    const report = await fechamentoMensalReport(paramsFromUrl(request));
    const csv = fechamentoCsv(report);
    return new NextResponse(`﻿${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="fechamento-mensal-${report.competencia.replace(/\s+/g, "-")}.csv"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar o fechamento em CSV.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 500) });
  }
}

import { NextResponse } from "next/server";
import { livroEntradasCsv, livroEntradasReport } from "@/lib/services/livro-entradas";

function paramsFromUrl(request: Request): { mes?: number; ano?: number } {
  const url = new URL(request.url);
  const mes = Number(url.searchParams.get("mes"));
  const ano = Number(url.searchParams.get("ano"));
  return { mes: Number.isFinite(mes) ? mes : undefined, ano: Number.isFinite(ano) ? ano : undefined };
}

export async function GET(request: Request) {
  try {
    const report = await livroEntradasReport(paramsFromUrl(request));
    const csv = livroEntradasCsv(report);
    return new NextResponse(`﻿${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="livro-entradas-${report.competencia.replace("/", "-")}.csv"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar o livro de entradas em CSV.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

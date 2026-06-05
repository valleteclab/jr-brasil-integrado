import { NextResponse } from "next/server";
import { apuracaoHtml } from "@/lib/services/apuracao-export";
import { apuracaoImpostosReport } from "@/lib/services/reports";

function paramsFromUrl(request: Request): { mes?: number; ano?: number } {
  const url = new URL(request.url);
  const mes = Number(url.searchParams.get("mes"));
  const ano = Number(url.searchParams.get("ano"));
  return { mes: Number.isFinite(mes) ? mes : undefined, ano: Number.isFinite(ano) ? ano : undefined };
}

export async function GET(request: Request) {
  try {
    const report = await apuracaoImpostosReport(paramsFromUrl(request));
    const html = apuracaoHtml(report);
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="apuracao-impostos-${report.competencia.replace(/\s+/g, "-")}.html"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar a apuração em HTML.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

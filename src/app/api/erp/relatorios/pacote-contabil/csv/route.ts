import { NextResponse } from "next/server";
import { accountingPackageCsv } from "@/lib/services/accounting-package-export";
import { accountingPackageReport } from "@/lib/services/reports";

function paramsFromUrl(request: Request): { mes?: number; ano?: number } {
  const url = new URL(request.url);
  const mes = Number(url.searchParams.get("mes"));
  const ano = Number(url.searchParams.get("ano"));
  return { mes: Number.isFinite(mes) ? mes : undefined, ano: Number.isFinite(ano) ? ano : undefined };
}

export async function GET(request: Request) {
  try {
    const report = await accountingPackageReport(paramsFromUrl(request));
    const csv = accountingPackageCsv(report);
    return new NextResponse(`\ufeff${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pacote-contabil-${report.competencia.replace(/\s+/g, "-")}.csv"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar pacote contábil em CSV.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

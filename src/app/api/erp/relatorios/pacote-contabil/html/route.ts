import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { accountingPackageHtml } from "@/lib/services/accounting-package-export";
import { accountingPackageReport } from "@/lib/services/reports";

function paramsFromUrl(request: Request): { mes?: number; ano?: number } {
  const url = new URL(request.url);
  const mes = Number(url.searchParams.get("mes"));
  const ano = Number(url.searchParams.get("ano"));
  return { mes: Number.isFinite(mes) ? mes : undefined, ano: Number.isFinite(ano) ? ano : undefined };
}

export async function GET(request: Request) {
  try {
    await requireModulo("relatorios");
    const report = await accountingPackageReport(paramsFromUrl(request));
    const html = accountingPackageHtml(report);
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="pacote-contabil-${report.competencia.replace(/\s+/g, "-")}.html"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar pacote contábil em HTML.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 500) });
  }
}

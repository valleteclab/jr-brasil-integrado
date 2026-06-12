import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { apuracaoCsv } from "@/lib/services/apuracao-export";
import { apuracaoImpostosReport } from "@/lib/services/reports";

function paramsFromUrl(request: Request): { mes?: number; ano?: number } {
  const url = new URL(request.url);
  const mes = Number(url.searchParams.get("mes"));
  const ano = Number(url.searchParams.get("ano"));
  return { mes: Number.isFinite(mes) ? mes : undefined, ano: Number.isFinite(ano) ? ano : undefined };
}

export async function GET(request: Request) {
  try {
    await requireModulo("relatorios");
    const report = await apuracaoImpostosReport(paramsFromUrl(request));
    const csv = apuracaoCsv(report);
    return new NextResponse(`﻿${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="apuracao-impostos-${report.competencia.replace(/\s+/g, "-")}.csv"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar a apuração em CSV.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 500) });
  }
}

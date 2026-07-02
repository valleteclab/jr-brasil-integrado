import { NextResponse } from "next/server";
import { simularStInterestadual, type SimulacaoStParams } from "@/domains/fiscal/st-simulacao";

/**
 * SIMULAÇÃO administrativa do ST interestadual (mesmo motor do script CLI) — protegida pelo
 * CRON_SECRET, como os crons. Só emite em HOMOLOGAÇÃO (a trava está no motor). Cria produto
 * TESTE-ST + regra de MVA + NF-e de teste pelos dois provedores e devolve o relatório.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function autorizado(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret")?.trim();
  return header === secret;
}

export async function POST(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  try {
    const body = (await request.json()) as SimulacaoStParams;
    const r = await simularStInterestadual(body);
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na simulação.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

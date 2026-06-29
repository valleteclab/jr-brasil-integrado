import { NextResponse } from "next/server";
import { runDistribuicaoCron } from "@/lib/services/nfe-distribution";

// Disparado por um agendador externo (crontab da VPS) a cada ~1h. NÃO usa sessão: é protegido por
// um segredo compartilhado (CRON_SECRET) no header `x-cron-secret` ou na query `?secret=`.
export const dynamic = "force-dynamic";
export const maxDuration = 300; // a carga + ciência pode levar minutos

function autorizado(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret")?.trim();
  const query = new URL(request.url).searchParams.get("secret")?.trim();
  return header === secret || query === secret;
}

async function handle(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const meses = Number(url.searchParams.get("meses")) || undefined;
    // ?reset=1 força um re-sync do NSU 0 (re-baixa o histórico com a data de emissão correta).
    const fromStart = url.searchParams.get("reset") === "1";
    const result = await runDistribuicaoCron({ mesesHistorico: meses, fromStart });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na sincronização da distribuição.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle; // permite o cron chamar via GET com ?secret= (curl simples)

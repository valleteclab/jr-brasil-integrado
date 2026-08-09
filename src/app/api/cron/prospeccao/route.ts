import { NextResponse } from "next/server";
import { runProspeccaoAtiva } from "@/domains/platform-sales/runtime/prospeccao-ativa";

/** Cron do SDR outbound — chamar a cada ~5 min (o ritmo/limites ficam na config). */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function autorizado(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret")?.trim();
  const query = new URL(request.url).searchParams.get("secret")?.trim();
  return header === secret || query === secret;
}

async function handle(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const resultado = await runProspeccaoAtiva();
    return NextResponse.json(resultado);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha na prospecção." }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;

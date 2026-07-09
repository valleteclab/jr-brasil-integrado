import { NextResponse } from "next/server";
import { rodarAlertasEmissor } from "@/domains/fiscal/application/emissor-alertas-use-cases";

/** Alertas de retenção do plano Emissor (sino): limite de notas, MEI 81k, A1 vencendo, DAS. */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const header = request.headers.get("x-cron-secret")?.trim();
  const query = new URL(request.url).searchParams.get("secret")?.trim();
  if (!secret || (header !== secret && query !== secret)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  try {
    const r = await rodarAlertasEmissor();
    return NextResponse.json({ ok: true, ...r });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha." }, { status: 500 });
  }
}

export async function POST(request: Request) { return handle(request); }
export async function GET(request: Request) { return handle(request); }

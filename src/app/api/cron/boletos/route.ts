import { NextResponse } from "next/server";
import { sincronizarBoletosCron } from "@/domains/finance/application/boleto-use-cases";

// Disparado pelo crontab da VPS (mesmo esquema do /api/cron/distribuicao): consulta os boletos
// registrados no Sicoob e baixa automaticamente os títulos liquidados (crédito na conta bancária).
// Protegido pelo segredo compartilhado (CRON_SECRET) no header `x-cron-secret` ou query `?secret=`.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    const result = await sincronizarBoletosCron();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na sincronização de boletos.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;

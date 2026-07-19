import { NextResponse } from "next/server";
import { monitorarReforma } from "@/domains/fiscal/application/reforma-monitor-use-cases";

/**
 * MONITOR da Reforma Tributária: vigia as fontes oficiais (NTs da NF-e, leiautes da NFS-e) e
 * roda o auto-check de prontidão (grupo IBSCBS nas notas de produção). Ver docs/REFORMA-ROADMAP.md.
 * Protegido por CRON_SECRET. `?forcar=1` ignora o throttle diário (para validação manual).
 */
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
    const forcar = new URL(request.url).searchParams.get("forcar") === "1";
    const result = await monitorarReforma({ forcar });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha no monitor da reforma." }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;

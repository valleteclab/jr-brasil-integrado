import { NextResponse } from "next/server";
import { requirePlatformAdmin, SessionError, ForbiddenError } from "@/lib/auth/session";
import { getMonitorReformaAdmin, monitorarReforma } from "@/domains/fiscal/application/reforma-monitor-use-cases";

/** Monitor da Reforma Tributária no painel do DONO do SaaS. GET = dados; POST = verificar agora. */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function statusFor(error: unknown): number {
  if (error instanceof SessionError) return 401;
  if (error instanceof ForbiddenError) return 403;
  return 500;
}

export async function GET() {
  try {
    await requirePlatformAdmin();
    return NextResponse.json(await getMonitorReformaAdmin());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: statusFor(error) });
  }
}

export async function POST() {
  try {
    await requirePlatformAdmin();
    const result = await monitorarReforma({ forcar: true });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: statusFor(error) });
  }
}

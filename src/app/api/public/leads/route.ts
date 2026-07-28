import { NextResponse } from "next/server";
import { captureCommercialLead } from "@/domains/platform-sales/application/commercial-lead-use-cases";

export const dynamic = "force-dynamic";

const attempts = new Map<string, { count: number; expiresAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function rateLimited(request: Request): boolean {
  const key = clientKey(request);
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.expiresAt <= now) {
    attempts.set(key, { count: 1, expiresAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_ATTEMPTS;
}

export async function POST(request: Request) {
  try {
    if (rateLimited(request)) {
      return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 });
    }
    const body = (await request.json()) as Record<string, unknown>;
    if (body.site) return NextResponse.json({ ok: true });
    const lead = await captureCommercialLead(body);
    return NextResponse.json({ ok: true, leadId: lead.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível registrar seu interesse." },
      { status: 400 }
    );
  }
}

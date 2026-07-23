import { NextResponse } from "next/server";
import { getMpConfigAdmin, salvarMpConfigAdmin, PlatformAdminError } from "@/lib/services/platform-admin";
import { SessionError, ForbiddenError } from "@/lib/auth/session";

function statusFor(error: unknown): number {
  if (error instanceof SessionError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof PlatformAdminError) return 400;
  return 500;
}

export async function GET() {
  try {
    return NextResponse.json(await getMpConfigAdmin());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: statusFor(error) });
  }
}

/** Salva as credenciais da aplicação Mercado Pago da plataforma. Body: { clientId, clientSecret? }. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { clientId?: string; clientSecret?: string | null };
    await salvarMpConfigAdmin(body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: statusFor(error) });
  }
}

import { NextResponse } from "next/server";
import { setEmpresaExigir2fa, PlatformAdminError } from "@/lib/services/platform-admin";
import { SessionError, ForbiddenError } from "@/lib/auth/session";

/** Liga/desliga o 2FA (código WhatsApp) no login dos usuários da empresa. Dono do SaaS. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json().catch(() => ({}))) as { exigir?: boolean };
    const r = await setEmpresaExigir2fa(params.id, body.exigir === true);
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao alterar o 2FA da empresa.";
    const status =
      error instanceof SessionError ? 401 : error instanceof ForbiddenError ? 403 : error instanceof PlatformAdminError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextResponse } from "next/server";
import { SessionError, ForbiddenError } from "@/lib/auth/session";
import { listarCobrancasAdmin, emitirNfseMensalidadeAdmin, PlatformAdminError } from "@/lib/services/platform-admin";

/** Cobranças da plataforma: GET = clientes + faturas (Asaas); POST = emitir NFS-e da mensalidade. */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function statusFor(error: unknown): number {
  if (error instanceof SessionError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof PlatformAdminError) return 400;
  return 500;
}

export async function GET() {
  try {
    return NextResponse.json({ cobrancas: await listarCobrancasAdmin() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: statusFor(error) });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { tenantId?: string; valor?: number | null; descricao?: string | null; codigoServicoLc116?: string | null };
    if (!body.tenantId) return NextResponse.json({ error: "Informe o cliente." }, { status: 400 });
    const r = await emitirNfseMensalidadeAdmin(body.tenantId, {
      valor: body.valor ?? null,
      descricao: body.descricao ?? null,
      codigoServicoLc116: body.codigoServicoLc116 ?? null
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: statusFor(error) });
  }
}

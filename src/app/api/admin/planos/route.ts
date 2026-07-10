import { NextResponse } from "next/server";
import { listPlanosSaas, salvarPlanoSaas, PlatformAdminError } from "@/lib/services/platform-admin";
import { SessionError, ForbiddenError } from "@/lib/auth/session";

function statusFor(error: unknown): number {
  if (error instanceof SessionError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof PlatformAdminError) return 400;
  return 500;
}

export async function GET() {
  try {
    return NextResponse.json({ planos: await listPlanosSaas() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: statusFor(error) });
  }
}

/** Edita um plano. Body: { codigo, nome?, descricao?, precoMensal?, limiteNotasMes?, trialDias?, ativo?, aplicarAssinantes? }. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { codigo: string; aplicarAssinantes?: boolean } & Record<string, unknown>;
    if (!body.codigo) return NextResponse.json({ error: "Informe o código do plano." }, { status: 400 });
    const { codigo, aplicarAssinantes, ...dados } = body;
    const plano = await salvarPlanoSaas(codigo, dados as Parameters<typeof salvarPlanoSaas>[1], { aplicarAssinantes: Boolean(aplicarAssinantes) });
    return NextResponse.json({ ok: true, plano });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: statusFor(error) });
  }
}

import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo, SessionError, ForbiddenError } from "@/lib/auth/session";
import { criarCiapBem, listCiapBens, SpedError, type CriarCiapBemInput } from "@/domains/fiscal/application/sped-use-cases";

function statusDoErro(error: unknown): number {
  if (error instanceof SessionError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof SpedError) return 400;
  return 500;
}

// Bens do ativo imobilizado controlados no CIAP (bloco G do SPED).
export async function GET() {
  try {
    await requireModulo("sped-fiscal");
    const scope = await getDevelopmentTenantScope();
    const bens = await listCiapBens(scope);
    return NextResponse.json({ bens });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar os bens do CIAP.";
    return NextResponse.json({ error: message }, { status: statusDoErro(error) });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireModulo("sped-fiscal");
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json().catch(() => ({}))) as CriarCiapBemInput;
    const bem = await criarCiapBem(scope, body, session.usuarioId);
    return NextResponse.json(bem);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao cadastrar o bem do CIAP.";
    return NextResponse.json({ error: message }, { status: statusDoErro(error) });
  }
}

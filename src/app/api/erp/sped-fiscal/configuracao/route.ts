import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo, SessionError, ForbiddenError } from "@/lib/auth/session";
import {
  getSpedConfiguracao,
  saveSpedConfiguracao,
  SpedError,
  type SpedConfiguracaoView
} from "@/domains/fiscal/application/sped-use-cases";

function statusDoErro(error: unknown): number {
  if (error instanceof SessionError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof SpedError) return 400;
  return 500;
}

// Configuração do SPED (perfil do arquivo, contador, E116).
export async function GET() {
  try {
    await requireModulo("sped-fiscal");
    const scope = await getDevelopmentTenantScope();
    const configuracao = await getSpedConfiguracao(scope);
    return NextResponse.json(configuracao);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar a configuração do SPED.";
    return NextResponse.json({ error: message }, { status: statusDoErro(error) });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireModulo("sped-fiscal");
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json().catch(() => ({}))) as Partial<SpedConfiguracaoView>;
    const configuracao = await saveSpedConfiguracao(scope, body, session.usuarioId);
    return NextResponse.json(configuracao);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar a configuração do SPED.";
    return NextResponse.json({ error: message }, { status: statusDoErro(error) });
  }
}

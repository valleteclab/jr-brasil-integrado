import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { getFiscalConfig, saveFiscalConfig } from "@/domains/fiscal/application/fiscal-config-use-cases";

export async function GET() {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    return NextResponse.json(await getFiscalConfig(scope));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar configuração fiscal.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const summary = await saveFiscalConfig(scope, await request.json());
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar configuração fiscal.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

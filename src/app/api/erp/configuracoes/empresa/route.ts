import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { getCompanySettings, saveCompanySettings, CompanySettingsError } from "@/lib/services/company-settings";

export async function GET() {
  try {
    const session = await requireModulo("configuracoes");
    if (!session.scope) throw new CompanySettingsError("Sessão sem empresa selecionada.");

    const settings = await getCompanySettings(session.scope);
    return NextResponse.json(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível carregar os dados da empresa.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireModulo("configuracoes");
    if (!session.scope) throw new CompanySettingsError("Sessão sem empresa selecionada.");

    const settings = await saveCompanySettings(session.scope, await request.json(), session.usuarioId);
    return NextResponse.json(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível salvar os dados da empresa.";
    const status = error instanceof CompanySettingsError ? 400 : authErrorStatus(error);
    return NextResponse.json({ error: message }, { status });
  }
}

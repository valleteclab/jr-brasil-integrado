import { NextResponse } from "next/server";
import { resolveEmpresaScope, PlatformAdminError } from "@/lib/services/platform-admin";
import { completeFiscalOnboarding, FiscalOnboardingError } from "@/domains/fiscal/application/fiscal-onboarding-use-cases";
import { SessionError, ForbiddenError } from "@/lib/auth/session";

// Dono do SaaS conclui o onboarding fiscal da empresa do cliente (config + base tributária).
export async function POST(request: Request, { params }: { params: { id: string; empresaId: string } }) {
  try {
    const scope = await resolveEmpresaScope(params.id, params.empresaId);
    const result = await completeFiscalOnboarding(scope, await request.json());
    return NextResponse.json({ ok: true, baselineRules: result.baseline?.criadas ?? 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao concluir o onboarding fiscal.";
    const status =
      error instanceof SessionError ? 401
      : error instanceof ForbiddenError ? 403
      : error instanceof PlatformAdminError || error instanceof FiscalOnboardingError ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { completeFiscalOnboarding, FiscalOnboardingError } from "@/domains/fiscal/application/fiscal-onboarding-use-cases";

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const result = await completeFiscalOnboarding(scope, await request.json());
    return NextResponse.json({ ok: true, baselineRules: result.baseline?.criadas ?? 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao concluir o onboarding fiscal.";
    const status = error instanceof FiscalOnboardingError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

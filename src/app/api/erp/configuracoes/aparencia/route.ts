import { NextResponse } from "next/server";
import { getBranding, saveBranding, BrandingError } from "@/domains/company/application/branding-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";

export async function GET() {
  try {
    await requireModulo("configuracoes");
    const scope = await getDevelopmentTenantScope();
    const branding = await getBranding(scope);
    return NextResponse.json(branding);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível carregar a aparência.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

export async function PUT(request: Request) {
  try {
    await requireModulo("configuracoes");
    const scope = await getDevelopmentTenantScope();
    const branding = await saveBranding(scope, await request.json());
    return NextResponse.json(branding);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível salvar a aparência.";
    return NextResponse.json({ error: message }, { status: error instanceof BrandingError ? 400 : authErrorStatus(error) });
  }
}

import { NextResponse } from "next/server";
import { getBranding, saveBranding, BrandingError } from "@/domains/company/application/branding-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export async function GET() {
  try {
    const scope = await getDevelopmentTenantScope();
    const branding = await getBranding(scope);
    return NextResponse.json(branding);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível carregar a aparência.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const branding = await saveBranding(scope, await request.json());
    return NextResponse.json(branding);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível salvar a aparência.";
    return NextResponse.json({ error: message }, { status: error instanceof BrandingError ? 400 : 500 });
  }
}

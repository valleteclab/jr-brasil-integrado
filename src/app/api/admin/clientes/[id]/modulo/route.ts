import { NextResponse } from "next/server";
import { setTenantModulo, PlatformAdminError } from "@/lib/services/platform-admin";
import { SessionError, ForbiddenError } from "@/lib/auth/session";
import { TENANT_FEATURE_FLAGS, type TenantFeatureKey } from "@/lib/auth/feature-flags";

// Dono do SaaS liga/desliga uma flag de módulo de um cliente (rota genérica). A flag é validada
// contra a whitelist TENANT_FEATURE_FLAGS antes de chegar ao banco.
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json()) as { flag?: string; habilitado?: boolean };
    if (!body.flag || !TENANT_FEATURE_FLAGS.includes(body.flag as TenantFeatureKey)) {
      return NextResponse.json({ error: "Módulo inválido." }, { status: 400 });
    }
    const r = await setTenantModulo(params.id, body.flag as TenantFeatureKey, Boolean(body.habilitado));
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar o módulo.";
    const status =
      error instanceof SessionError ? 401
      : error instanceof ForbiddenError ? 403
      : error instanceof PlatformAdminError ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

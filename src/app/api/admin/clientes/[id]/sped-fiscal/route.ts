import { NextResponse } from "next/server";
import { setTenantSpedFiscalHabilitado, PlatformAdminError } from "@/lib/services/platform-admin";
import { SessionError, ForbiddenError } from "@/lib/auth/session";

// Dono do SaaS habilita/desabilita o módulo SPED Fiscal (EFD ICMS/IPI) para um cliente.
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json()) as { habilitado?: boolean };
    const r = await setTenantSpedFiscalHabilitado(params.id, Boolean(body.habilitado));
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar o módulo SPED Fiscal.";
    const status =
      error instanceof SessionError ? 401
      : error instanceof ForbiddenError ? 403
      : error instanceof PlatformAdminError ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

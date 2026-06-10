import { NextResponse } from "next/server";
import { setTenantExpedicaoHabilitada, PlatformAdminError } from "@/lib/services/platform-admin";
import { SessionError, ForbiddenError } from "@/lib/auth/session";

// Dono do SaaS habilita/desabilita o módulo Expedição (recibo de retirada) para um cliente.
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json()) as { habilitada?: boolean };
    const r = await setTenantExpedicaoHabilitada(params.id, Boolean(body.habilitada));
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar o módulo Expedição.";
    const status =
      error instanceof SessionError ? 401
      : error instanceof ForbiddenError ? 403
      : error instanceof PlatformAdminError ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

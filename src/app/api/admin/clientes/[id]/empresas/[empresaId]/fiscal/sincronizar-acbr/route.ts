import { NextResponse } from "next/server";
import { resolveEmpresaScope, PlatformAdminError } from "@/lib/services/platform-admin";
import { sincronizarEmpresaAcbr } from "@/domains/fiscal/application/fiscal-config-use-cases";
import { SessionError, ForbiddenError } from "@/lib/auth/session";

// Dono do SaaS cadastra/atualiza a empresa do cliente na ACBr por API (sem o console).
export async function POST(_request: Request, { params }: { params: { id: string; empresaId: string } }) {
  try {
    const scope = await resolveEmpresaScope(params.id, params.empresaId);
    const result = await sincronizarEmpresaAcbr(scope);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao sincronizar a empresa na ACBr.";
    const status =
      error instanceof SessionError ? 401
      : error instanceof ForbiddenError ? 403
      : error instanceof PlatformAdminError ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

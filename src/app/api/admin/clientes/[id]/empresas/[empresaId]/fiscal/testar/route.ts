import { NextResponse } from "next/server";
import { resolveEmpresaScope, PlatformAdminError } from "@/lib/services/platform-admin";
import { testFiscalConnection } from "@/domains/fiscal/application/fiscal-config-use-cases";
import { SessionError, ForbiddenError } from "@/lib/auth/session";

// Dono do SaaS testa a conexão fiscal (certificado + provedor) da empresa do cliente.
export async function POST(_request: Request, { params }: { params: { id: string; empresaId: string } }) {
  try {
    const scope = await resolveEmpresaScope(params.id, params.empresaId);
    const result = await testFiscalConnection(scope);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao testar a conexão fiscal.";
    const status =
      error instanceof SessionError ? 401
      : error instanceof ForbiddenError ? 403
      : error instanceof PlatformAdminError ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

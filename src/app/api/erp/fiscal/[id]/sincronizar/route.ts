import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { syncNotaFiscalStatus } from "@/domains/fiscal/application/fiscal-sync-use-cases";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const result = await syncNotaFiscalStatus(scope, params.id);
    return NextResponse.json({ status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao sincronizar a nota fiscal.";
    // Erros de validação (regras de negócio) retornam 400; inesperados, 500.
    const isValidation =
      message.includes("não encontrada") || message.includes("não possui referência");
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, isValidation ? 400 : 500) });
  }
}

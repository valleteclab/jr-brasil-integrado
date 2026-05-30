import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { syncNotaFiscalStatus } from "@/domains/fiscal/application/fiscal-sync-use-cases";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const scope = await getDevelopmentTenantScope();
    const result = await syncNotaFiscalStatus(scope, params.id);
    return NextResponse.json({ status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao sincronizar a nota fiscal.";
    // Erros de validação (regras de negócio) retornam 400; inesperados, 500.
    const isValidation =
      message.includes("não encontrada") || message.includes("não possui referência");
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 });
  }
}

import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { estornarBaixaReceivable, FinanceValidationError } from "@/domains/finance/application/finance-use-cases";

// ESTORNA a baixa de uma conta a receber (desfaz o recebimento e ajusta o saldo bancário).
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const conta = await estornarBaixaReceivable(scope, params.id);
    return NextResponse.json({ id: conta.id, status: conta.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao estornar baixa da conta a receber.";
    const status = authErrorStatus(error, error instanceof FinanceValidationError ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}

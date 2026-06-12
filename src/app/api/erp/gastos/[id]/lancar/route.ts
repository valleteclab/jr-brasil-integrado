import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { lancarGastoNoFinanceiro } from "@/domains/expenses/application/gasto-use-cases";

// Lança o gasto no financeiro (cria conta a pagar quitada).
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("gastos");
    const scope = await getDevelopmentTenantScope();
    const result = await lancarGastoNoFinanceiro(scope, params.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao lançar no financeiro.";
    const isValidation = message.includes("não encontrado") || message.includes("já foi lançado");
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, isValidation ? 400 : 500) });
  }
}

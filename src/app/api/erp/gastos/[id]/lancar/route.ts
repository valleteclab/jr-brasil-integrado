import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { lancarGastoNoFinanceiro } from "@/domains/expenses/application/gasto-use-cases";

// Lança o gasto no financeiro (cria conta a pagar quitada). `contaBancariaId` opcional
// escolhe qual conta é debitada; sem ele, usa a primeira conta ativa.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("gastos");
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json().catch(() => ({}))) as { contaBancariaId?: string };
    const result = await lancarGastoNoFinanceiro(scope, params.id, body.contaBancariaId || undefined);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao lançar no financeiro.";
    const isValidation = message.includes("não encontrado") || message.includes("já foi lançado");
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, isValidation ? 400 : 500) });
  }
}

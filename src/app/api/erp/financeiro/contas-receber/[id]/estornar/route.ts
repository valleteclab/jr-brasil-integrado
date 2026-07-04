import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { estornarBaixaReceivable, listBaixasReceivable, FinanceValidationError } from "@/domains/finance/application/finance-use-cases";

// Lista as baixas do título (para a UI escolher qual estornar).
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const baixas = await listBaixasReceivable(scope, params.id);
    return NextResponse.json({ baixas });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar baixas.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

// ESTORNA a baixa de uma conta a receber (total, ou só uma baixa via movimentoId).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json().catch(() => ({}))) as { movimentoId?: string };
    const conta = await estornarBaixaReceivable(scope, params.id, body.movimentoId ? { movimentoId: body.movimentoId } : undefined);
    return NextResponse.json({ id: conta.id, status: conta.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao estornar baixa da conta a receber.";
    const status = authErrorStatus(error, error instanceof FinanceValidationError ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}

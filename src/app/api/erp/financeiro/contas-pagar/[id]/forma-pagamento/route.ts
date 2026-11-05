import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo, getSession } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { corrigirFormaPagamento } from "@/domains/finance/application/payable-edit-use-cases";
import { FinanceValidationError } from "@/domains/finance/application/finance-use-cases";

/** Corrige só o rótulo da forma de pagamento — vale também para conta já paga. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as { formaPagamento?: string | null };
    const conta = await corrigirFormaPagamento(scope, params.id, body.formaPagamento ?? null, session?.usuarioId);
    return NextResponse.json({ id: conta.id, formaPagamento: conta.formaPagamento });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao corrigir a forma de pagamento.";
    return NextResponse.json(
      { error: message },
      { status: authErrorStatus(error, error instanceof FinanceValidationError ? 400 : 500) }
    );
  }
}

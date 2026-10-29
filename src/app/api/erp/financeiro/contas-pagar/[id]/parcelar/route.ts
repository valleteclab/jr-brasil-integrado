import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { FinanceValidationError } from "@/domains/finance/application/finance-use-cases";
import { splitPayable } from "@/domains/finance/application/payable-edit-use-cases";

/** Quebra uma conta a pagar em N parcelas (a original vira a 1ª). */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as { parcelas?: number; primeiroVencimento?: string; intervaloDias?: number; valores?: number[] };
    const r = await splitPayable(
      scope,
      params.id,
      {
        parcelas: Number(body.parcelas),
        primeiroVencimento: body.primeiroVencimento,
        intervaloDias: body.intervaloDias,
        valores: body.valores
      },
      session?.usuarioId
    );
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao parcelar a conta.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof FinanceValidationError ? 400 : 500) });
  }
}

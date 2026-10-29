import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { FinanceValidationError } from "@/domains/finance/application/finance-use-cases";
import { settlePayablesEmLote } from "@/domains/finance/application/payable-edit-use-cases";

/** Baixa várias contas a pagar na mesma conta financeira e data (fechamento do mês). */
export async function POST(request: Request) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as {
      contaPagarIds?: string[];
      contaBancariaId?: string;
      dataPagamento?: string;
      formaPagamento?: string | null;
    };
    const r = await settlePayablesEmLote(
      scope,
      {
        contaPagarIds: body.contaPagarIds ?? [],
        contaBancariaId: body.contaBancariaId ?? "",
        dataPagamento: body.dataPagamento,
        formaPagamento: body.formaPagamento ?? null
      },
      session?.usuarioId
    );
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro na baixa em lote.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof FinanceValidationError ? 400 : 500) });
  }
}

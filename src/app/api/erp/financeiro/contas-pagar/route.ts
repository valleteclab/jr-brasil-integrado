import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { createPayable, FinanceValidationError } from "@/domains/finance/application/finance-use-cases";

export async function POST(request: Request) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const body = await request.json() as {
      descricao: string;
      fornecedorId?: string;
      valor: number;
      vencimento: string;
      formaPagamento?: string;
      numeroDocumento?: string;
      observacoes?: string;
    };

    const conta = await createPayable(scope, {
      descricao: body.descricao,
      fornecedorId: body.fornecedorId,
      valor: Number(body.valor),
      vencimento: new Date(body.vencimento),
      formaPagamento: body.formaPagamento,
      numeroDocumento: body.numeroDocumento,
      observacoes: body.observacoes
    });

    return NextResponse.json({ id: conta.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar conta a pagar.";
    const status = authErrorStatus(error, error instanceof FinanceValidationError ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}

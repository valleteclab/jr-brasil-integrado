import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { settleReceivable, FinanceValidationError } from "@/domains/finance/application/finance-use-cases";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = await request.json() as {
      valor: number;
      juros?: number;
      multa?: number;
      descontoBaixa?: number;
      formaPagamento?: string;
      contaBancariaId?: string;
      dataPagamento?: string;
    };

    const conta = await settleReceivable(scope, params.id, {
      valor: Number(body.valor),
      juros: body.juros !== undefined ? Number(body.juros) : undefined,
      multa: body.multa !== undefined ? Number(body.multa) : undefined,
      descontoBaixa: body.descontoBaixa !== undefined ? Number(body.descontoBaixa) : undefined,
      formaPagamento: body.formaPagamento,
      contaBancariaId: body.contaBancariaId,
      dataPagamento: body.dataPagamento ? new Date(body.dataPagamento) : undefined
    });

    return NextResponse.json({ id: conta.id, status: conta.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao baixar conta a receber.";
    const status = error instanceof FinanceValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

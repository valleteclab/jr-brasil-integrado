import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { settlePayable, FinanceValidationError } from "@/domains/finance/application/finance-use-cases";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const body = await request.json() as {
      valor: number;
      juros?: number;
      multa?: number;
      descontoBaixa?: number;
      formaPagamento?: string;
      contaBancariaId?: string;
      dataPagamento?: string;
      maquinaCartaoId?: string | null;
      bandeira?: string | null;
      parcelas?: number | null;
    };

    const conta = await settlePayable(scope, params.id, {
      valor: Number(body.valor),
      juros: body.juros !== undefined ? Number(body.juros) : undefined,
      multa: body.multa !== undefined ? Number(body.multa) : undefined,
      descontoBaixa: body.descontoBaixa !== undefined ? Number(body.descontoBaixa) : undefined,
      formaPagamento: body.formaPagamento,
      contaBancariaId: body.contaBancariaId,
      dataPagamento: body.dataPagamento ? new Date(body.dataPagamento) : undefined,
      maquinaCartaoId: body.maquinaCartaoId ?? null,
      bandeira: body.bandeira ?? null,
      parcelas: body.parcelas != null ? Number(body.parcelas) : null
    });

    return NextResponse.json({ id: conta.id, status: conta.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao baixar conta a pagar.";
    const status = authErrorStatus(error, error instanceof FinanceValidationError ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}

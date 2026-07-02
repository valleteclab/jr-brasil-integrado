import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { receberPagamentoEEmitir, CaixaError, type PagamentoDetalhado } from "@/domains/cashier/application/cashier-use-cases";

export async function POST(request: Request) {
  try {
    await requireModulo("caixa");
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as {
      pedidoId?: string;
      modelo?: "NFE" | "NFCE";
      pagamentos?: PagamentoDetalhado[];
      retiradaExpedicao?: boolean;
      emitirFiscal?: boolean;
      boletoOpcoes?: { contaBancariaId?: string | null; parcelas?: number | null; primeiroVencimento?: string | null; datas?: string[] | null; valores?: number[] | null } | null;
    };
    if (!body.pedidoId) return NextResponse.json({ error: "Pré-venda não informada." }, { status: 400 });
    const result = await receberPagamentoEEmitir(scope, {
      pedidoId: body.pedidoId,
      modelo: body.modelo === "NFE" ? "NFE" : "NFCE",
      pagamentos: body.pagamentos ?? [],
      retiradaExpedicao: body.retiradaExpedicao,
      emitirFiscal: body.emitirFiscal,
      boletoOpcoes: body.boletoOpcoes ?? null
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao receber o pagamento.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof CaixaError ? 400 : 500) });
  }
}

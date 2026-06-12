import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { receberPagamentoEEmitir, CaixaError, type PagamentoDetalhado } from "@/domains/cashier/application/cashier-use-cases";

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as {
      pedidoId?: string;
      modelo?: "NFE" | "NFCE";
      pagamentos?: PagamentoDetalhado[];
      retiradaExpedicao?: boolean;
    };
    if (!body.pedidoId) return NextResponse.json({ error: "Pré-venda não informada." }, { status: 400 });
    const result = await receberPagamentoEEmitir(scope, {
      pedidoId: body.pedidoId,
      modelo: body.modelo === "NFE" ? "NFE" : "NFCE",
      pagamentos: body.pagamentos ?? [],
      retiradaExpedicao: body.retiradaExpedicao
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao receber o pagamento.";
    return NextResponse.json({ error: message }, { status: error instanceof CaixaError ? 400 : 500 });
  }
}

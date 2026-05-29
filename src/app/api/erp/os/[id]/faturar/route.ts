import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { faturarOrdemServico } from "@/domains/service-order/application/service-order-use-cases";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = await request.json();

    const result = await faturarOrdemServico(scope, params.id, {
      emitirNfse: body.emitirNfse === true,
      condicaoPagamento: body.condicaoPagamento ?? undefined,
      formaPagamento: body.formaPagamento ?? undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao faturar OS.";
    const isValidation =
      message.includes("já foi faturada") ||
      message.includes("cancelada") ||
      message.includes("deve estar");
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 });
  }
}

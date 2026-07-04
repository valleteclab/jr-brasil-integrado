import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { faturarOrdemServico } from "@/domains/service-order/application/service-order-use-cases";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("os");
    const scope = await getDevelopmentTenantScope();
    const body = await request.json();

    const result = await faturarOrdemServico(scope, params.id, {
      emitirNfse: body.emitirNfse === true,
      emitirNfePecas: body.emitirNfePecas === true,
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
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, isValidation ? 400 : 500) });
  }
}

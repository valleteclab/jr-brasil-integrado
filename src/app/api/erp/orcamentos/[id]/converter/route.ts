import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { convertQuoteToPedido } from "@/domains/sales-quote/application/quote-use-cases";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("orcamentos");
    const scope = await getDevelopmentTenantScope();
    const result = await convertQuoteToPedido(scope, params.id);
    return NextResponse.json({
      orcamentoId: result.orcamento.id,
      pedidoId: result.pedido.id,
      numeroPedido: result.pedido.numero,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao converter orçamento.";
    const isValidation = message.includes("APROVADO") || message.includes("não encontrado");
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, isValidation ? 400 : 500) });
  }
}

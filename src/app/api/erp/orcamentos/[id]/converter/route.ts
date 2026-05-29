import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { convertQuoteToPedido } from "@/domains/sales-quote/application/quote-use-cases";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
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
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 });
  }
}

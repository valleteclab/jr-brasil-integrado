import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { cancelSale } from "@/domains/sales/application/sale-use-cases";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireModulo("vendas");
    const scope = await getDevelopmentTenantScope();
    const pedido = await cancelSale(scope, params.id);
    // cobrancas: resultado da cascata no banco (boletos baixados no Sicoob / avisos de falha).
    return NextResponse.json({ id: pedido.id, status: pedido.status, cobrancas: pedido.cobrancas });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao cancelar venda.";
    const isValidation =
      message.includes("não encontrado") ||
      message.includes("já está") ||
      message.includes("Não é possível") ||
      message.includes("nota fiscal");
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, isValidation ? 400 : 500) });
  }
}

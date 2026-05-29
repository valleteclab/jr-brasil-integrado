import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { cancelSale } from "@/domains/sales/application/sale-use-cases";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const scope = await getDevelopmentTenantScope();
    const pedido = await cancelSale(scope, params.id);
    return NextResponse.json({ id: pedido.id, status: pedido.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao cancelar venda.";
    const isValidation =
      message.includes("não encontrado") ||
      message.includes("já está") ||
      message.includes("Não é possível") ||
      message.includes("nota fiscal");
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 });
  }
}

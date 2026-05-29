import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { createSale } from "@/domains/sales/application/sale-use-cases";

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = await request.json();

    if (!body.clienteId) {
      return NextResponse.json({ error: "Cliente é obrigatório." }, { status: 400 });
    }
    if (!body.itens || !Array.isArray(body.itens) || body.itens.length === 0) {
      return NextResponse.json({ error: "Pelo menos um item é obrigatório." }, { status: 400 });
    }

    const pedido = await createSale(scope, body);
    return NextResponse.json({ id: pedido.id, numero: pedido.numero });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar venda.";
    const isValidation = message.includes("obrigatório") || message.includes("inválido") || message.includes("ao menos");
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 });
  }
}

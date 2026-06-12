import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { createSale } from "@/domains/sales/application/sale-use-cases";

export async function POST(request: Request) {
  try {
    await requireModulo("vendas");
    const scope = await getDevelopmentTenantScope();
    const body = await request.json();

    // Venda de balcão/PDV admite consumidor não identificado (emite NFC-e). Demais canais
    // (faturado/delivery) exigem cliente, pois costumam emitir NF-e (destinatário obrigatório).
    const canalSemCliente = ["BALCAO", "PDV"].includes(String(body.canal ?? "").toUpperCase());
    if (!body.clienteId && !canalSemCliente) {
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
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, isValidation ? 400 : 500) });
  }
}

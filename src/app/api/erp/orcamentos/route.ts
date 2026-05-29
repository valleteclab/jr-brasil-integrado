import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { createQuote } from "@/domains/sales-quote/application/quote-use-cases";

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

    const orcamento = await createQuote(scope, body);
    return NextResponse.json({ id: orcamento.id, numero: orcamento.numero });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar orçamento.";
    const isValidation = message.includes("obrigatório") || message.includes("ao menos");
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 });
  }
}

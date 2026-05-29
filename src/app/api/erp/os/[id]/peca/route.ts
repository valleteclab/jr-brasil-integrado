import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { addPeca, removePeca } from "@/domains/service-order/application/service-order-use-cases";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = await request.json();

    if (!body.produtoId) {
      return NextResponse.json({ error: "Produto é obrigatório." }, { status: 400 });
    }
    if (!body.quantidade || Number(body.quantidade) <= 0) {
      return NextResponse.json({ error: "Quantidade deve ser maior que zero." }, { status: 400 });
    }
    if (!body.precoUnitario || Number(body.precoUnitario) <= 0) {
      return NextResponse.json({ error: "Preço unitário deve ser maior que zero." }, { status: 400 });
    }

    const peca = await addPeca(scope, params.id, {
      produtoId: body.produtoId,
      quantidade: Number(body.quantidade),
      precoUnitario: Number(body.precoUnitario),
    });
    return NextResponse.json({ id: peca.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao adicionar peça.";
    const isValidation = message.includes("obrigatório") || message.includes("maior que zero");
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = await request.json();

    if (!body.pecaId) {
      return NextResponse.json({ error: "pecaId é obrigatório." }, { status: 400 });
    }

    const result = await removePeca(scope, params.id, body.pecaId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao remover peça.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { transferStock } from "@/domains/stock/application/stock-adjust-use-cases";

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as {
      produtoId?: string;
      depositoOrigemId?: string;
      depositoDestinoId?: string;
      quantidade?: unknown;
    };

    const { produtoId, depositoOrigemId, depositoDestinoId, quantidade } = body;

    if (!produtoId || typeof produtoId !== "string") {
      return NextResponse.json({ error: "produtoId é obrigatório." }, { status: 400 });
    }
    if (!depositoOrigemId || typeof depositoOrigemId !== "string") {
      return NextResponse.json({ error: "depositoOrigemId é obrigatório." }, { status: 400 });
    }
    if (!depositoDestinoId || typeof depositoDestinoId !== "string") {
      return NextResponse.json({ error: "depositoDestinoId é obrigatório." }, { status: 400 });
    }
    if (!quantidade || isNaN(Number(quantidade)) || Number(quantidade) <= 0) {
      return NextResponse.json({ error: "quantidade deve ser maior que zero." }, { status: 400 });
    }

    const resultado = await transferStock(scope, {
      produtoId,
      depositoOrigemId,
      depositoDestinoId,
      quantidade: Number(quantidade)
    });

    return NextResponse.json(resultado);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao transferir estoque.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

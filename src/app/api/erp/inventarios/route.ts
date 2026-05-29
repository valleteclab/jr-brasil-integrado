import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { createInventory } from "@/domains/stock/application/inventory-use-cases";

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as {
      depositoId?: string;
      descricao?: string;
    };

    const { depositoId, descricao } = body;

    if (!depositoId || typeof depositoId !== "string") {
      return NextResponse.json({ error: "depositoId é obrigatório." }, { status: 400 });
    }

    const inventario = await createInventory(scope, {
      depositoId,
      descricao: descricao ?? undefined
    });

    return NextResponse.json({ id: inventario.id, numero: inventario.numero });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar inventário.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

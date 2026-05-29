import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { finalizeInventory } from "@/domains/stock/application/inventory-use-cases";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const scope = await getDevelopmentTenantScope();
    const { id } = params;

    const resultado = await finalizeInventory(scope, id);

    return NextResponse.json({
      id: resultado.inventario.id,
      status: resultado.inventario.status,
      ajustesRealizados: resultado.ajustesRealizados
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao finalizar inventário.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

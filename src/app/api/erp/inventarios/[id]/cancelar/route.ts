import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { cancelInventory } from "@/domains/stock/application/inventory-use-cases";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const scope = await getDevelopmentTenantScope();
    const { id } = params;

    // Cancela o inventário (a função de domínio valida status: não cancela finalizado/cancelado).
    const inventario = await cancelInventory(scope, id);

    return NextResponse.json({
      id: inventario.id,
      status: inventario.status
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao cancelar inventário.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

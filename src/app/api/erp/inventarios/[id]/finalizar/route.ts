import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { finalizeInventory } from "@/domains/stock/application/inventory-use-cases";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireModulo("inventarios");
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
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

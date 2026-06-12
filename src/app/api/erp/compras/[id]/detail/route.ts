import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { getPurchaseOrderDetail } from "@/lib/services/purchasing";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireModulo("compras");
    const { id } = await context.params;
    const scope = await getDevelopmentTenantScope();
    const detail = await getPurchaseOrderDetail(id);

    if (!detail) {
      return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
    }

    // Filter scope check is done inside getPurchaseOrderDetail via getDevelopmentTenantScope
    void scope;
    return NextResponse.json(detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar pedido.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

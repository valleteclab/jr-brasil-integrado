import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { cancelPurchaseOrder, PurchaseValidationError } from "@/domains/purchasing/application/purchase-use-cases";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const scope = await getDevelopmentTenantScope();
    await cancelPurchaseOrder(scope, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao cancelar pedido de compra.";
    const status = error instanceof PurchaseValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

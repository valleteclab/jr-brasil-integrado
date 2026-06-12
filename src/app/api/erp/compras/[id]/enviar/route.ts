import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { sendPurchaseOrder, PurchaseValidationError } from "@/domains/purchasing/application/purchase-use-cases";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    await requireModulo("compras");
    const { id } = await context.params;
    const scope = await getDevelopmentTenantScope();
    await sendPurchaseOrder(scope, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao enviar pedido de compra.";
    const status = authErrorStatus(error, error instanceof PurchaseValidationError ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}

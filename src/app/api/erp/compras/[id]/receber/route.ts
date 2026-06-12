import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { receivePurchaseOrder, PurchaseValidationError } from "@/domains/purchasing/application/purchase-use-cases";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    await requireModulo("compras");
    const { id } = await context.params;
    const scope = await getDevelopmentTenantScope();
    const body = await request.json();
    const result = await receivePurchaseOrder(scope, id, body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao registrar recebimento.";
    const status = authErrorStatus(error, error instanceof PurchaseValidationError ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}

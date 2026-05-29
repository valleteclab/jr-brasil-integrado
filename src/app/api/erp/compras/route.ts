import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { createPurchaseOrder, PurchaseValidationError } from "@/domains/purchasing/application/purchase-use-cases";

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = await request.json();
    const pedido = await createPurchaseOrder(scope, body);
    return NextResponse.json({ id: pedido.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar pedido de compra.";
    const status = error instanceof PurchaseValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { pdvCheckout } from "@/domains/sales/application/pdv-use-cases";

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const result = await pdvCheckout(scope, await request.json());
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível finalizar a venda.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

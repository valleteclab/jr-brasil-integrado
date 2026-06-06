import { NextResponse } from "next/server";
import { consultarGtinCosmos } from "@/domains/products/application/cosmos-service";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export async function GET(_request: Request, { params }: { params: { gtin: string } }) {
  try {
    const scope = await getDevelopmentTenantScope();
    const produto = await consultarGtinCosmos(scope, params.gtin);
    return NextResponse.json(produto);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível consultar o código de barras.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

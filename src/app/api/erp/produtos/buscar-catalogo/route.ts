import { NextResponse } from "next/server";
import { buscarProdutosCosmos } from "@/domains/products/application/cosmos-service";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export async function GET(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const query = new URL(request.url).searchParams.get("q") ?? "";
    const produtos = await buscarProdutosCosmos(scope, query);
    return NextResponse.json({ produtos });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível buscar no catálogo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

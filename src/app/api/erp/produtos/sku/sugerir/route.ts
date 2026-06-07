import { NextResponse } from "next/server";
import { suggestSku } from "@/domains/products/application/product-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export async function GET(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const base = new URL(request.url).searchParams.get("base") ?? undefined;
    const sku = await suggestSku(scope, base);
    return NextResponse.json({ sku });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível sugerir um SKU.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

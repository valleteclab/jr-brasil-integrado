import { NextResponse } from "next/server";
import { suggestSku } from "@/domains/products/application/product-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";

export async function GET(request: Request) {
  try {
    await requireModulo("produtos");
    const scope = await getDevelopmentTenantScope();
    const base = new URL(request.url).searchParams.get("base") ?? undefined;
    const sku = await suggestSku(scope, base);
    return NextResponse.json({ sku });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível sugerir um SKU.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

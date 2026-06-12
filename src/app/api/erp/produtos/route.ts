import { NextResponse } from "next/server";
import { createProduct } from "@/domains/products/application/product-use-cases";
import { ProductValidationError } from "@/domains/products/application/product-dto";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";

export async function POST(request: Request) {
  try {
    await requireModulo("produtos");
    const scope = await getDevelopmentTenantScope();
    const product = await createProduct(scope, await request.json());

    return NextResponse.json({ id: product.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao cadastrar produto.";
    const status = authErrorStatus(error, error instanceof ProductValidationError ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}

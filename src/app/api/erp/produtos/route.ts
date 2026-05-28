import { NextResponse } from "next/server";
import { createProduct } from "@/domains/products/application/product-use-cases";
import { ProductValidationError } from "@/domains/products/application/product-dto";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const product = await createProduct(scope, await request.json());

    return NextResponse.json({ id: product.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao cadastrar produto.";
    const status = error instanceof ProductValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

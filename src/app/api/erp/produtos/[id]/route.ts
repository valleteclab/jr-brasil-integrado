import { NextResponse } from "next/server";
import { archiveOrDeleteProduct, updateProduct } from "@/domains/products/application/product-use-cases";
import { ProductValidationError } from "@/domains/products/application/product-dto";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const scope = await getDevelopmentTenantScope();
    const product = await updateProduct(scope, params.id, await request.json());

    return NextResponse.json({ id: product.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar produto.";
    const status = error instanceof ProductValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const scope = await getDevelopmentTenantScope();
    const result = await archiveOrDeleteProduct(scope, params.id);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir produto.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

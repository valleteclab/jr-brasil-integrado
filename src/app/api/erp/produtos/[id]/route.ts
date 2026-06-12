import { NextResponse } from "next/server";
import { archiveOrDeleteProduct, updateProduct } from "@/domains/products/application/product-use-cases";
import { ProductValidationError } from "@/domains/products/application/product-dto";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("produtos");
    const scope = await getDevelopmentTenantScope();
    const product = await updateProduct(scope, params.id, await request.json());

    return NextResponse.json({ id: product.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar produto.";
    const status = authErrorStatus(error, error instanceof ProductValidationError ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("produtos");
    const scope = await getDevelopmentTenantScope();
    const result = await archiveOrDeleteProduct(scope, params.id);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir produto.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 500) });
  }
}

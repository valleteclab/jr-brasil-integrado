import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { createSupplier, SupplierValidationError } from "@/domains/purchasing/application/supplier-use-cases";

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = await request.json();
    const fornecedor = await createSupplier(scope, body);
    return NextResponse.json({ id: fornecedor.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao cadastrar fornecedor.";
    const status = error instanceof SupplierValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

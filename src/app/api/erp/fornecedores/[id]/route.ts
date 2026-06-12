import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import {
  updateSupplier,
  archiveSupplier,
  SupplierValidationError
} from "@/domains/purchasing/application/supplier-use-cases";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  try {
    await requireModulo("fornecedores");
    const { id } = await context.params;
    const scope = await getDevelopmentTenantScope();
    const body = await request.json();
    const fornecedor = await updateSupplier(scope, id, body);
    return NextResponse.json({ id: fornecedor.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar fornecedor.";
    const status = authErrorStatus(error, error instanceof SupplierValidationError ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireModulo("fornecedores");
    const { id } = await context.params;
    const scope = await getDevelopmentTenantScope();
    await archiveSupplier(scope, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao arquivar fornecedor.";
    const status = authErrorStatus(error, error instanceof SupplierValidationError ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}

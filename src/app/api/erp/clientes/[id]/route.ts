import { NextResponse } from "next/server";
import { updateCustomer, CustomerValidationError } from "@/domains/customers/application/customer-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = await request.json();
    const cliente = await updateCustomer(scope, params.id, body);
    return NextResponse.json({ id: cliente.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar cliente.";
    const status = error instanceof CustomerValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

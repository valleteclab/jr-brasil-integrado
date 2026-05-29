import { NextResponse } from "next/server";
import { createCustomer, CustomerValidationError } from "@/domains/customers/application/customer-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = await request.json();
    const cliente = await createCustomer(scope, body);
    return NextResponse.json({ id: cliente.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao cadastrar cliente.";
    const status = error instanceof CustomerValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

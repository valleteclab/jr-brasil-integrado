import { NextResponse } from "next/server";
import { archiveCustomer, CustomerValidationError } from "@/domains/customers/application/customer-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const scope = await getDevelopmentTenantScope();
    const cliente = await archiveCustomer(scope, params.id);
    return NextResponse.json({ id: cliente.id, status: cliente.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao arquivar cliente.";
    const status = error instanceof CustomerValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

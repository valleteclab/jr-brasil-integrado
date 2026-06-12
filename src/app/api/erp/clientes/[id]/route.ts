import { NextResponse } from "next/server";
import { updateCustomer, CustomerValidationError } from "@/domains/customers/application/customer-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { getCustomerDetail } from "@/lib/services/customers-admin";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("clientes");
    const cliente = await getCustomerDetail(params.id);
    if (!cliente) {
      return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    }
    return NextResponse.json(cliente);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar cliente.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 500) });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("clientes");
    const scope = await getDevelopmentTenantScope();
    const body = await request.json();
    const cliente = await updateCustomer(scope, params.id, body);
    return NextResponse.json({ id: cliente.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar cliente.";
    const status = authErrorStatus(error, error instanceof CustomerValidationError ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}

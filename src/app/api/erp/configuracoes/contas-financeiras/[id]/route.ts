import { NextResponse } from "next/server";
import { archiveContaFinanceira, updateContaFinanceira } from "@/domains/finance/application/payment-config-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const scope = await getDevelopmentTenantScope();
    const conta = await updateContaFinanceira(scope, params.id, await request.json());
    return NextResponse.json({ id: conta.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível atualizar a conta financeira.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const scope = await getDevelopmentTenantScope();
    const result = await archiveContaFinanceira(scope, params.id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível inativar a conta financeira.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

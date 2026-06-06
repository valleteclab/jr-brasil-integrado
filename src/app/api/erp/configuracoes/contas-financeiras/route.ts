import { NextResponse } from "next/server";
import { createContaFinanceira, listContasFinanceiras } from "@/domains/finance/application/payment-config-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export async function GET() {
  try {
    const scope = await getDevelopmentTenantScope();
    const contas = await listContasFinanceiras(scope);
    return NextResponse.json({ contas });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível listar as contas financeiras.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const conta = await createContaFinanceira(scope, await request.json());
    return NextResponse.json({ id: conta.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível cadastrar a conta financeira.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

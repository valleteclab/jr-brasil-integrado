import { NextResponse } from "next/server";
import { createContaFinanceira, listContasFinanceiras } from "@/domains/finance/application/payment-config-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";

export async function GET() {
  try {
    await requireModulo("configuracoes");
    const scope = await getDevelopmentTenantScope();
    const contas = await listContasFinanceiras(scope);
    return NextResponse.json({ contas });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível listar as contas financeiras.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    await requireModulo("configuracoes");
    const scope = await getDevelopmentTenantScope();
    const conta = await createContaFinanceira(scope, await request.json());
    return NextResponse.json({ id: conta.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível cadastrar a conta financeira.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

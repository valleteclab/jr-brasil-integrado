import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { fecharCaixa, CaixaError } from "@/domains/cashier/application/cashier-use-cases";

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json().catch(() => ({}))) as { saldoFinalInformado?: number; observacao?: string };
    const result = await fecharCaixa(scope, body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao fechar o caixa.";
    return NextResponse.json({ error: message }, { status: error instanceof CaixaError ? 400 : 500 });
  }
}

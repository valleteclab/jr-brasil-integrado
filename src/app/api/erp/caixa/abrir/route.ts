import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { abrirCaixa, CaixaError } from "@/domains/cashier/application/cashier-use-cases";

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as { operador?: string; saldoInicial?: number; observacao?: string };
    const caixa = await abrirCaixa(scope, { operador: body.operador ?? "", saldoInicial: body.saldoInicial, observacao: body.observacao });
    return NextResponse.json({ id: caixa.id, status: caixa.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao abrir o caixa.";
    return NextResponse.json({ error: message }, { status: error instanceof CaixaError ? 400 : 500 });
  }
}

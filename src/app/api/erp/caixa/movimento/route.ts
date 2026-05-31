import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { registrarMovimentoCaixa, CaixaError } from "@/domains/cashier/application/cashier-use-cases";

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as { tipo?: "SUPRIMENTO" | "SANGRIA"; valor?: number; descricao?: string };
    if (body.tipo !== "SUPRIMENTO" && body.tipo !== "SANGRIA") {
      return NextResponse.json({ error: "Tipo de movimento inválido." }, { status: 400 });
    }
    const mov = await registrarMovimentoCaixa(scope, { tipo: body.tipo, valor: body.valor ?? 0, descricao: body.descricao });
    return NextResponse.json({ id: mov.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao registrar o movimento.";
    return NextResponse.json({ error: message }, { status: error instanceof CaixaError ? 400 : 500 });
  }
}

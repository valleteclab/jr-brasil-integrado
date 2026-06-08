import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { listGastos } from "@/lib/services/gastos";
import { criarGastoManual } from "@/domains/expenses/application/gasto-use-cases";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await listGastos());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao listar gastos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = await request.json();
    const result = await criarGastoManual(scope, body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar gasto.";
    const isValidation = message.includes("Informe");
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 });
  }
}

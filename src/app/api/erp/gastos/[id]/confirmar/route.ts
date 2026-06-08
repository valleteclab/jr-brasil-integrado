import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { confirmarGasto } from "@/domains/expenses/application/gasto-use-cases";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const scope = await getDevelopmentTenantScope();
    const result = await confirmarGasto(scope, params.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao confirmar gasto.";
    return NextResponse.json({ error: message }, { status: message.includes("não encontrado") ? 400 : 500 });
  }
}

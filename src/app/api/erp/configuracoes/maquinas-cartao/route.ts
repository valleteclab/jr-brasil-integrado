import { NextResponse } from "next/server";
import { createMaquinaCartao, listMaquinasCartao } from "@/domains/finance/application/payment-config-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export async function GET() {
  try {
    const scope = await getDevelopmentTenantScope();
    const maquinas = await listMaquinasCartao(scope);
    return NextResponse.json({ maquinas });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível listar as máquinas de cartão.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const maquina = await createMaquinaCartao(scope, await request.json());
    return NextResponse.json({ id: maquina.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível cadastrar a máquina de cartão.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

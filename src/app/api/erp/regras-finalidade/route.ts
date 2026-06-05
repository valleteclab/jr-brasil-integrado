import { NextResponse } from "next/server";
import { createRegraFinalidade, listRegrasFinalidade } from "@/domains/fiscal/application/finalidade-regra-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export async function GET() {
  try {
    const scope = await getDevelopmentTenantScope();
    const rules = await listRegrasFinalidade(scope);

    return NextResponse.json({ rules });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível listar as regras de finalidade.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const rule = await createRegraFinalidade(scope, await request.json());

    return NextResponse.json({ id: rule.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível cadastrar a regra de finalidade.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

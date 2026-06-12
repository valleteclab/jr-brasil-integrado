import { NextResponse } from "next/server";
import { createTaxRule, listTaxRulesForApi } from "@/domains/tax-rules/application/tax-rule-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";

export async function GET() {
  try {
    await requireModulo("regras-tributarias");
    const scope = await getDevelopmentTenantScope();
    const rules = await listTaxRulesForApi(scope);

    return NextResponse.json({ rules });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível listar regras tributárias.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    await requireModulo("regras-tributarias");
    const scope = await getDevelopmentTenantScope();
    const rule = await createTaxRule(scope, await request.json());

    return NextResponse.json({ id: rule.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível cadastrar a regra tributária.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

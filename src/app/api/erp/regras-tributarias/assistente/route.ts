import { NextResponse } from "next/server";
import { suggestTaxRuleWithAi } from "@/domains/tax-rules/application/tax-rule-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";

export async function POST(request: Request) {
  try {
    await requireModulo("regras-tributarias");
    const scope = await getDevelopmentTenantScope();
    const result = await suggestTaxRuleWithAi(scope, await request.json());

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível consultar o assistente fiscal.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

import { NextResponse } from "next/server";
import { suggestTaxRuleWithAi } from "@/domains/tax-rules/application/tax-rule-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const result = await suggestTaxRuleWithAi(scope, await request.json());

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível consultar o assistente fiscal.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

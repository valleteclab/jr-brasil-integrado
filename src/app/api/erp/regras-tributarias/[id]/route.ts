import { NextResponse } from "next/server";
import { archiveTaxRule, updateTaxRule } from "@/domains/tax-rules/application/tax-rule-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("regras-tributarias");
    const scope = await getDevelopmentTenantScope();
    const rule = await updateTaxRule(scope, params.id, await request.json());

    return NextResponse.json({ id: rule.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível atualizar a regra tributária.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("regras-tributarias");
    const scope = await getDevelopmentTenantScope();
    const result = await archiveTaxRule(scope, params.id);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível inativar a regra tributária.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

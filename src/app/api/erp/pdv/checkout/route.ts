import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { pdvCheckout, type PdvCheckoutInput } from "@/domains/sales/application/pdv-use-cases";

export async function POST(request: Request) {
  try {
    await requireModulo("vendas");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as PdvCheckoutInput;
    // Só o perfil FINANCEIRO autoriza venda a prazo acima do limite.
    const podeFinanceiro = Boolean(session?.modulos.includes("financeiro"));
    const result = await pdvCheckout(scope, { ...body, autorizarLimite: body.autorizarLimite === true && podeFinanceiro });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível finalizar a venda.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

import { NextResponse } from "next/server";
import { archiveFormaPagamento, updateFormaPagamento } from "@/domains/finance/application/payment-config-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const scope = await getDevelopmentTenantScope();
    const forma = await updateFormaPagamento(scope, params.id, await request.json());
    return NextResponse.json({ id: forma.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível atualizar a forma de pagamento.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const scope = await getDevelopmentTenantScope();
    const result = await archiveFormaPagamento(scope, params.id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível inativar a forma de pagamento.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

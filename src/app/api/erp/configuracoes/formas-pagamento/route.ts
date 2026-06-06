import { NextResponse } from "next/server";
import { createFormaPagamento, listFormasPagamento } from "@/domains/finance/application/payment-config-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export async function GET() {
  try {
    const scope = await getDevelopmentTenantScope();
    const formas = await listFormasPagamento(scope);
    return NextResponse.json({ formas });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível listar as formas de pagamento.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const forma = await createFormaPagamento(scope, await request.json());
    return NextResponse.json({ id: forma.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível cadastrar a forma de pagamento.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

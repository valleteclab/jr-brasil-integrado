import { NextResponse } from "next/server";
import { setSaleCliente } from "@/domains/sales/application/sale-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";

type RouteContext = { params: Promise<{ id: string }> };

// Identifica/troca o cliente de um pedido (ex.: no caixa, consumidor antes anônimo).
export async function PUT(request: Request, context: RouteContext) {
  try {
    await requireModulo("caixa");
    const { id } = await context.params;
    const body = (await request.json()) as { clienteId?: string | null };
    const scope = await getDevelopmentTenantScope();
    const result = await setSaleCliente(scope, id, body.clienteId ?? null);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível identificar o cliente.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { FinanceValidationError } from "@/domains/finance/application/finance-use-cases";
import { ignorarLinha } from "@/domains/finance/application/ofx-use-cases";

/** Marca a linha do extrato como ignorada (transferência própria, estorno, aplicação). */
export async function POST(request: Request) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as { linhaId?: string; motivo?: string };
    if (!body.linhaId) throw new FinanceValidationError("Informe a linha do extrato.");
    const r = await ignorarLinha(scope, body.linhaId, body.motivo ?? "", session?.usuarioId);
    return NextResponse.json({ id: r.id, status: r.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao ignorar a linha.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof FinanceValidationError ? 400 : 500) });
  }
}

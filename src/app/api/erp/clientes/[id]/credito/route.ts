import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { avaliarCredito, ultimaConsultaCliente } from "@/domains/credito/application/consulta-credito-use-cases";

/** Última consulta de crédito do cliente + situação do limite (leitura, NÃO cobra). */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const [ultima, avaliacao] = await Promise.all([
      ultimaConsultaCliente(scope, params.id),
      avaliarCredito(scope, params.id)
    ]);
    return NextResponse.json({ ultima, avaliacao });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: authErrorStatus(error, 500) });
  }
}

import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { BoletoError, sincronizarBoleto } from "@/domains/finance/application/boleto-use-cases";

/** Consulta a situação do boleto no Sicoob; liquidado → baixa o título automaticamente. */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const resultado = await sincronizarBoleto(scope, params.id);
    return NextResponse.json(resultado);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao consultar o boleto.";
    const status = authErrorStatus(error, error instanceof BoletoError ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}

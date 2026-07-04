import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { AntecipacaoError, desfazerAntecipacao } from "@/domains/finance/application/antecipacao-use-cases";

/** Desfaz uma antecipação: reabre os títulos, apaga a taxa e devolve o saldo bancário. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const resultado = await desfazerAntecipacao(scope, params.id, session?.usuarioId);
    return NextResponse.json(resultado);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao desfazer a antecipação.";
    const status = authErrorStatus(error, error instanceof AntecipacaoError ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}

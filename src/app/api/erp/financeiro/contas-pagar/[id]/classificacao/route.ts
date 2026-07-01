import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { ClassificacaoValidationError, setClassificacaoConta } from "@/domains/finance/application/classificacao-use-cases";

/** Define/remove a classificação financeira de uma conta a pagar (null limpa). */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const body = await request.json() as { classificacaoId?: string | null };
    await setClassificacaoConta(scope, "pagar", params.id, body.classificacaoId || null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao classificar a conta.";
    const status = authErrorStatus(error, error instanceof ClassificacaoValidationError ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}

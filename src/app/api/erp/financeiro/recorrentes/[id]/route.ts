import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { RecorrenciaError, alterarStatusRecorrencia } from "@/domains/finance/application/recorrencia-use-cases";

/** Pausa/reativa/encerra a recorrência. Body: { status: "ATIVA" | "PAUSADA" | "ENCERRADA" }. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as { status?: string };
    const status = (body.status ?? "").toUpperCase();
    if (!["ATIVA", "PAUSADA", "ENCERRADA"].includes(status)) throw new RecorrenciaError("Status inválido.");
    const r = await alterarStatusRecorrencia(scope, params.id, status as "ATIVA" | "PAUSADA" | "ENCERRADA", session?.usuarioId);
    return NextResponse.json({ status: r.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao alterar a despesa recorrente.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof RecorrenciaError ? 400 : 500) });
  }
}

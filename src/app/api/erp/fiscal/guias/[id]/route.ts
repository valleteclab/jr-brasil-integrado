import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { GuiaError, atualizarGuia } from "@/domains/fiscal/application/guia-use-cases";

/** Atualiza a guia GNRE: { status: "PAGA"|"PENDENTE"|"CANCELADA", numeroGuia?, pagoEm? (ISO) }. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as { status?: string; numeroGuia?: string | null; pagoEm?: string | null };
    const status = (body.status ?? "").toUpperCase();
    if (!["PAGA", "PENDENTE", "CANCELADA"].includes(status)) throw new GuiaError("Status inválido.");
    const g = await atualizarGuia(scope, params.id, {
      status: status as "PAGA" | "PENDENTE" | "CANCELADA",
      numeroGuia: body.numeroGuia,
      pagoEm: body.pagoEm ? new Date(`${body.pagoEm}T12:00:00`) : null
    }, session?.usuarioId);
    return NextResponse.json({ status: g.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar a guia.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof GuiaError ? 400 : 500) });
  }
}

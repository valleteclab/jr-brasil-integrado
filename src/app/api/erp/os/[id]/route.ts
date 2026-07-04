import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { updateOrdemServico } from "@/domains/service-order/application/service-order-use-cases";

/** Edita o cabeçalho da OS: dados do veículo/diagnóstico, técnico responsável, previsão, desconto. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("os");
    const scope = await getDevelopmentTenantScope();
    const os = await updateOrdemServico(scope, params.id, await request.json());
    return NextResponse.json({ id: os.id, total: Number(os.total), desconto: Number(os.desconto) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao editar a OS.";
    const isValidation = message.includes("não pode") || message.includes("não encontrad");
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, isValidation ? 400 : 500) });
  }
}

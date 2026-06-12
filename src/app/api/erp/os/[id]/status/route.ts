import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { updateStatus } from "@/domains/service-order/application/service-order-use-cases";
import type { StatusOrdemServico } from "@prisma/client";

const VALID: StatusOrdemServico[] = ["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_PECAS", "FINALIZADA_NAO_FATURADA"];

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("os");
    const scope = await getDevelopmentTenantScope();
    const body = await request.json();

    if (!body.status || !VALID.includes(body.status as StatusOrdemServico)) {
      return NextResponse.json(
        { error: `Status inválido. Use: ${VALID.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await updateStatus(scope, params.id, body.status as StatusOrdemServico);
    return NextResponse.json({ id: result.id, status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar status.";
    const isValidation = message.includes("Não é possível");
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, isValidation ? 400 : 500) });
  }
}

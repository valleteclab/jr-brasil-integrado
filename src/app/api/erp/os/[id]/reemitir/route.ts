import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { reemitirNotaOrdemServico } from "@/domains/service-order/application/service-order-use-cases";

/** Reemite a nota da OS (NFS-e dos serviços ou NF-e das peças) — reaproveita a rejeitada quando há. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("os");
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as { tipo?: "SERVICOS" | "PECAS" };
    if (body.tipo !== "SERVICOS" && body.tipo !== "PECAS") {
      return NextResponse.json({ error: "Informe o tipo (SERVICOS ou PECAS)." }, { status: 400 });
    }
    const r = await reemitirNotaOrdemServico(scope, params.id, body.tipo);
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao reemitir a nota.";
    const isValidation = message.includes("não tem") || message.includes("precisa estar") || message.includes("Já existe") || message.includes("não encontrada");
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, isValidation ? 400 : 500) });
  }
}

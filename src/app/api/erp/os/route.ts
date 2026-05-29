import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { createOrdemServico } from "@/domains/service-order/application/service-order-use-cases";

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = await request.json();

    if (!body.clienteId) {
      return NextResponse.json({ error: "Cliente é obrigatório." }, { status: 400 });
    }
    if (!body.equipamento) {
      return NextResponse.json({ error: "Equipamento é obrigatório." }, { status: 400 });
    }

    const os = await createOrdemServico(scope, body);
    return NextResponse.json({ id: os.id, numero: os.numero });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar ordem de serviço.";
    const isValidation = message.includes("obrigatório");
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 });
  }
}

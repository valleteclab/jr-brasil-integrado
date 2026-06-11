import { NextResponse } from "next/server";
import { archiveMaquinaCartao, updateMaquinaCartao } from "@/domains/finance/application/payment-config-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const scope = await getDevelopmentTenantScope();
    const maquina = await updateMaquinaCartao(scope, params.id, await request.json());
    return NextResponse.json({ id: maquina.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível atualizar a máquina de cartão.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const scope = await getDevelopmentTenantScope();
    const result = await archiveMaquinaCartao(scope, params.id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível inativar a máquina de cartão.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";

// Remove um telefone autorizado (escopado por tenant+empresa).
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const scope = await getDevelopmentTenantScope();
    const tel = await prisma.agenteTelefone.findFirst({
      where: { id: params.id, tenantId: scope.tenantId, empresaId: scope.empresaId }
    });
    if (!tel) return NextResponse.json({ error: "Telefone não encontrado." }, { status: 404 });
    await prisma.agenteTelefone.delete({ where: { id: tel.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao remover telefone.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireAdmin } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";

// Revoga (desativa) uma chave de API do agente/MCP. Escopada por tenant+empresa.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    // Revoga credencial de API (segredo) — restrito a admin.
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const chave = await prisma.chaveApiAgente.findFirst({
      where: { id: params.id, tenantId: scope.tenantId, empresaId: scope.empresaId }
    });
    if (!chave) return NextResponse.json({ error: "Chave não encontrada." }, { status: 404 });
    await prisma.chaveApiAgente.update({ where: { id: chave.id }, data: { ativo: false } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao revogar a chave.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

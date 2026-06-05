import { NextResponse } from "next/server";
import { alterarPerfilVinculo, definirVinculoAtivo, removerVinculo, PlatformAdminError } from "@/lib/services/platform-admin";
import { SessionError, ForbiddenError } from "@/lib/auth/session";

function statusDoErro(error: unknown): number {
  if (error instanceof SessionError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof PlatformAdminError) return 400;
  return 500;
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json().catch(() => ({}))) as { perfilId?: string; ativo?: boolean };
    let result: unknown;
    if (typeof body.perfilId === "string" && body.perfilId) {
      result = await alterarPerfilVinculo(params.id, body.perfilId);
    } else if (typeof body.ativo === "boolean") {
      result = await definirVinculoAtivo(params.id, body.ativo);
    } else {
      return NextResponse.json({ error: 'Informe "perfilId" ou "ativo".' }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar vínculo.";
    return NextResponse.json({ error: message }, { status: statusDoErro(error) });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await removerVinculo(params.id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao remover vínculo.";
    return NextResponse.json({ error: message }, { status: statusDoErro(error) });
  }
}

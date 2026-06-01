import { NextResponse } from "next/server";
import { atualizarPerfilModulos, PlatformAdminError } from "@/lib/services/platform-admin";
import { SessionError, ForbiddenError } from "@/lib/auth/session";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json().catch(() => ({}))) as { modulos?: string[] };
    const result = await atualizarPerfilModulos(params.id, Array.isArray(body.modulos) ? body.modulos : []);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar perfil.";
    const status =
      error instanceof SessionError ? 401 : error instanceof ForbiddenError ? 403 : error instanceof PlatformAdminError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

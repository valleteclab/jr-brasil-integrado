import { NextResponse } from "next/server";
import { atualizarUsuario, PlatformAdminError, type AtualizarUsuarioInput } from "@/lib/services/platform-admin";
import { SessionError, ForbiddenError } from "@/lib/auth/session";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json().catch(() => ({}))) as AtualizarUsuarioInput;
    const result = await atualizarUsuario(params.id, body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar usuário.";
    const status =
      error instanceof SessionError
        ? 401
        : error instanceof ForbiddenError
          ? 403
          : error instanceof PlatformAdminError
            ? 400
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextResponse } from "next/server";
import { criarUsuario, PlatformAdminError, type CriarUsuarioInput } from "@/lib/services/platform-admin";
import { SessionError, ForbiddenError } from "@/lib/auth/session";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as CriarUsuarioInput;
    const result = await criarUsuario(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar usuário.";
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

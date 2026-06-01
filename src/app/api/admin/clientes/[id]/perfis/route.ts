import { NextResponse } from "next/server";
import { criarPerfilCliente, PlatformAdminError } from "@/lib/services/platform-admin";
import { SessionError, ForbiddenError } from "@/lib/auth/session";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json().catch(() => ({}))) as { nome?: string; descricao?: string; modulos?: string[] };
    const result = await criarPerfilCliente(params.id, {
      nome: body.nome ?? "",
      descricao: body.descricao,
      modulos: Array.isArray(body.modulos) ? body.modulos : []
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar perfil.";
    const status =
      error instanceof SessionError ? 401 : error instanceof ForbiddenError ? 403 : error instanceof PlatformAdminError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

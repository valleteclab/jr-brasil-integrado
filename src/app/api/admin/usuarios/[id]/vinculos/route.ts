import { NextResponse } from "next/server";
import { adicionarVinculo, PlatformAdminError } from "@/lib/services/platform-admin";
import { SessionError, ForbiddenError } from "@/lib/auth/session";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json().catch(() => ({}))) as { tenantId?: string; empresaId?: string; perfilId?: string };
    const result = await adicionarVinculo(params.id, {
      tenantId: body.tenantId ?? "",
      empresaId: body.empresaId ?? "",
      perfilId: body.perfilId ?? ""
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao adicionar vínculo.";
    const status =
      error instanceof SessionError ? 401 : error instanceof ForbiddenError ? 403 : error instanceof PlatformAdminError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

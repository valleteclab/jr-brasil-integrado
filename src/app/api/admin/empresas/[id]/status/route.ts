import { NextResponse } from "next/server";
import { setEmpresaStatus, PlatformAdminError } from "@/lib/services/platform-admin";
import { SessionError, ForbiddenError } from "@/lib/auth/session";

const STATUS_VALIDOS = ["ATIVA", "INATIVA", "BLOQUEADA"] as const;
type EmpresaStatus = (typeof STATUS_VALIDOS)[number];

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json().catch(() => ({}))) as { status?: string };
    if (!body.status || !STATUS_VALIDOS.includes(body.status as EmpresaStatus)) {
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    }
    const r = await setEmpresaStatus(params.id, body.status as EmpresaStatus);
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao alterar status da empresa.";
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

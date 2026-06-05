import { NextResponse } from "next/server";
import { setTenantAtivo, PlatformAdminError } from "@/lib/services/platform-admin";
import { SessionError, ForbiddenError } from "@/lib/auth/session";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const r = await setTenantAtivo(params.id, true);
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao liberar cliente.";
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

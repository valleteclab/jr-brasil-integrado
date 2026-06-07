import { NextResponse } from "next/server";
import { testarCredenciaisProvedorPlataforma, PlatformAdminError } from "@/lib/services/platform-admin";
import { SessionError, ForbiddenError } from "@/lib/auth/session";

// Dono do SaaS testa as credenciais de um provedor + ambiente (ping autenticado).
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { provedor?: string; ambiente?: "HOMOLOGACAO" | "PRODUCAO" };
    if (!body.provedor || (body.ambiente !== "HOMOLOGACAO" && body.ambiente !== "PRODUCAO")) {
      return NextResponse.json({ error: "Informe provedor e ambiente." }, { status: 400 });
    }
    return NextResponse.json(await testarCredenciaisProvedorPlataforma(body.provedor, body.ambiente));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao testar.";
    const status =
      error instanceof SessionError ? 401
      : error instanceof ForbiddenError ? 403
      : error instanceof PlatformAdminError ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

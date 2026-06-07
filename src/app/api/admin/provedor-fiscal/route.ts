import { NextResponse } from "next/server";
import { saveProvedorFiscalPlataforma, getProvedorFiscalPlataforma, PlatformAdminError } from "@/lib/services/platform-admin";
import { SessionError, ForbiddenError } from "@/lib/auth/session";

// Dono do SaaS lê/configura o provedor de emissão (ACBr) por ambiente: client_id, client_secret, URL.
export async function GET() {
  try {
    return NextResponse.json(await getProvedorFiscalPlataforma());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: statusFor(error) });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      ambiente?: "HOMOLOGACAO" | "PRODUCAO";
      clientId?: string;
      clientSecret?: string;
      baseUrl?: string;
      ativo?: boolean;
    };
    if (body.ambiente !== "HOMOLOGACAO" && body.ambiente !== "PRODUCAO") {
      return NextResponse.json({ error: "Ambiente inválido." }, { status: 400 });
    }
    const result = await saveProvedorFiscalPlataforma({
      ambiente: body.ambiente,
      clientId: body.clientId,
      clientSecret: body.clientSecret,
      baseUrl: body.baseUrl,
      ativo: body.ativo
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao salvar." }, { status: statusFor(error) });
  }
}

function statusFor(error: unknown): number {
  if (error instanceof SessionError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof PlatformAdminError) return 400;
  return 500;
}

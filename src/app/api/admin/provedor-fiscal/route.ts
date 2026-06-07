import { NextResponse } from "next/server";
import {
  saveProvedorFiscalPlataforma,
  getProvedorFiscalPlataforma,
  setProvedorFiscalAtivo,
  PlatformAdminError
} from "@/lib/services/platform-admin";
import { SessionError, ForbiddenError } from "@/lib/auth/session";

// Dono do SaaS lê/configura o provedor de emissão (qual está ativo + credenciais por ambiente).
export async function GET() {
  try {
    return NextResponse.json(await getProvedorFiscalPlataforma());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: statusFor(error) });
  }
}

// Define o provedor ATIVO da plataforma.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { provedor?: string };
    if (!body.provedor) return NextResponse.json({ error: "Informe o provedor." }, { status: 400 });
    return NextResponse.json(await setProvedorFiscalAtivo(body.provedor));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: statusFor(error) });
  }
}

// Salva credenciais/URL de um provedor + ambiente.
export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      provedor?: string;
      ambiente?: "HOMOLOGACAO" | "PRODUCAO";
      clientId?: string;
      clientSecret?: string;
      token?: string;
      baseUrl?: string;
      ativo?: boolean;
    };
    if (!body.provedor) return NextResponse.json({ error: "Informe o provedor." }, { status: 400 });
    if (body.ambiente !== "HOMOLOGACAO" && body.ambiente !== "PRODUCAO") {
      return NextResponse.json({ error: "Ambiente inválido." }, { status: 400 });
    }
    const result = await saveProvedorFiscalPlataforma({
      provedor: body.provedor,
      ambiente: body.ambiente,
      clientId: body.clientId,
      clientSecret: body.clientSecret,
      token: body.token,
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

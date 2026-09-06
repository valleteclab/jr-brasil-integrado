import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { commercialEvolutionEnabled, evolutionConnection } from "@/lib/whatsapp/commercial-evolution";

async function connection(request: Request, connect: boolean) {
  try {
    const user = await requirePlatformAdmin();
    if (!commercialEvolutionEnabled()) return NextResponse.json({ error: "WhatsApp próprio não habilitado." }, { status: 400 });
    if (connect && request.headers.get("origin") !== new URL(process.env.ERP_BASE || request.url).origin) {
      return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
    }
    const result = await evolutionConnection(connect);
    if (connect) console.info("[comercial/conexao]", { usuarioId: user.usuarioId, acao: "CONECTAR", status: result.status });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: "Não foi possível consultar ou conectar o WhatsApp. Verifique o acesso e a configuração do servidor." }, { status: authErrorStatus(error, 502) });
  }
}
export async function GET(request: Request) { return connection(request, false); }
export async function POST(request: Request) { return connection(request, true); }

import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { enviarNotaFiscal, type CanalEnvio } from "@/domains/comms/application/document-send-use-cases";

// Envia a nota fiscal (PDF + XML) ao cliente por e-mail e/ou WhatsApp.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as { canais?: CanalEnvio[]; email?: string | null; telefone?: string | null };
    const resultado = await enviarNotaFiscal(scope, params.id, {
      canais: Array.isArray(body.canais) ? body.canais : [],
      email: body.email,
      telefone: body.telefone
    });
    return NextResponse.json(resultado);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível enviar a nota fiscal.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

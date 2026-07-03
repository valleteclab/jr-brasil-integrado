import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { enviarBoleto, type CanalEnvio } from "@/domains/comms/application/document-send-use-cases";

// Envia o boleto (PDF + linha digitável) ao cliente por e-mail e/ou WhatsApp.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as { canais?: CanalEnvio[]; email?: string | null; telefone?: string | null };
    const resultado = await enviarBoleto(scope, params.id, {
      canais: Array.isArray(body.canais) ? body.canais : [],
      email: body.email,
      telefone: body.telefone
    });
    return NextResponse.json(resultado);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível enviar o boleto.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

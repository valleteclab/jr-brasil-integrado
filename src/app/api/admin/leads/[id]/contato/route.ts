import { NextResponse } from "next/server";
import { authErrorStatus } from "@/lib/auth/http";
import { registrarContatoManual } from "@/domains/platform-sales/application/commercial-lead-use-cases";

/** Registra na linha do tempo um contato feito à mão com o lead. */
export async function POST(request: Request, context: { params: { id: string } }) {
  try {
    const body = (await request.json()) as {
      conteudo?: string;
      canal?: string;
      proximoFollowupEm?: string | null;
      status?: string;
    };
    const r = await registrarContatoManual(context.params.id, {
      conteudo: body.conteudo ?? "",
      canal: body.canal,
      proximoFollowupEm: body.proximoFollowupEm ?? null,
      status: body.status
    });
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao registrar o contato.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

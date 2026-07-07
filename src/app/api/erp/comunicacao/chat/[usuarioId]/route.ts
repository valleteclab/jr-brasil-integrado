import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { abrirConversa, enviarMensagemInterna } from "@/domains/comunicacao/application/comunicacao-use-cases";

/** Conversa com um usuário (marca recebidas como lidas). */
export async function GET(_request: Request, { params }: { params: { usuarioId: string } }) {
  try {
    const session = await getSession();
    if (!session?.scope) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    const mensagens = await abrirConversa(session.scope, session.usuarioId, params.usuarioId);
    return NextResponse.json({ mensagens });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: 500 });
  }
}

/** Envia uma mensagem para o usuário. Body: { texto }. */
export async function POST(request: Request, { params }: { params: { usuarioId: string } }) {
  try {
    const session = await getSession();
    if (!session?.scope) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    const body = (await request.json()) as { texto: string };
    const msg = await enviarMensagemInterna(session.scope, session.usuarioId, params.usuarioId, body.texto);
    return NextResponse.json({ ok: true, mensagem: msg });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: 400 });
  }
}

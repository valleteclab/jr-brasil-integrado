import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listarNotificacoes, listarUsuariosChat, contarChatNaoLido } from "@/domains/comunicacao/application/comunicacao-use-cases";

/** Estado do widget de comunicação: notificações + contatos do chat + não lidas. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.scope) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    const [notificacoes, contatos, chatNaoLido] = await Promise.all([
      listarNotificacoes(session.scope, session.usuarioId),
      listarUsuariosChat(session.scope, session.usuarioId),
      contarChatNaoLido(session.scope, session.usuarioId)
    ]);
    return NextResponse.json({ notificacoes, contatos, chatNaoLido, usuarioId: session.usuarioId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: 500 });
  }
}

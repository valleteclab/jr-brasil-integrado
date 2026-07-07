import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { marcarNotificacaoLida } from "@/domains/comunicacao/application/comunicacao-use-cases";

/** Marca uma notificação (id) ou todas (sem id) como lidas. */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.scope) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    await marcarNotificacaoLida(session.scope, session.usuarioId, body.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: 500 });
  }
}

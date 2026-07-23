import { NextResponse } from "next/server";

/**
 * LIVENESS do container (healthcheck do Swarm): responde 200 quando o Next está DE PÉ e com as
 * rotas carregadas — sem tocar o banco (banco fora não deve reiniciar o app em loop; para status
 * do banco use /api/health, que devolve 503 p/ monitoramento externo). Durante o boot o servidor
 * responde 404 aqui → healthcheck falha → o Swarm segura o tráfego até o app estar pronto.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true });
}

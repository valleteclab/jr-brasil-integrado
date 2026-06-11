import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { subscribeRealtime, type RealtimeEvent } from "@/lib/realtime/broker";

// SSE precisa de runtime Node (EventEmitter) e resposta não-cacheada de longa duração.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stream de eventos em tempo real (Server-Sent Events) do escopo autenticado. O cliente abre
 * com EventSource("/api/erp/realtime"); o cookie de sessão (mesma origem) autentica via
 * middleware + getSessionScope, então cada loja recebe só os próprios eventos.
 *
 * Envia um "data:" por mudança ({canal, ts}) e um heartbeat de comentário a cada 25s para
 * manter a conexão viva através de proxies (Nginx/Cloudflare cortam conexões ociosas).
 */
export async function GET(request: Request) {
  const scope = await getDevelopmentTenantScope();

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: string) => {
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // controlador já fechado — ignorado
        }
      };

      // Evento inicial: confirma a conexão (o cliente sabe que está "ao vivo").
      send(`event: ready\ndata: {"ts":${Date.now()}}\n\n`);

      unsubscribe = subscribeRealtime(scope, (event: RealtimeEvent) => {
        send(`data: ${JSON.stringify(event)}\n\n`);
      });

      heartbeat = setInterval(() => send(`: ping ${Date.now()}\n\n`), 25_000);

      // Cliente fechou a aba / navegou: limpa assinatura e heartbeat.
      request.signal.addEventListener("abort", () => {
        if (heartbeat) clearInterval(heartbeat);
        if (unsubscribe) unsubscribe();
        try {
          controller.close();
        } catch {
          // já fechado
        }
      });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Desativa o buffering do Nginx para o SSE fluir em tempo real.
      "X-Accel-Buffering": "no"
    }
  });
}

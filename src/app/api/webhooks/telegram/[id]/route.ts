import { NextResponse } from "next/server";
import { getTelegramRuntimeById } from "@/lib/telegram/telegram-service";
import { processTelegramCallback, processTelegramMessage } from "@/domains/agent/runtime/process-telegram-message";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** URL pública do sistema a partir dos headers do proxy (Traefik). */
function baseUrlDe(request: Request): string {
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host")?.trim() || "";
  return host ? `${proto}://${host}` : "";
}


/**
 * Webhook de entrada do Telegram (um por empresa: /api/webhooks/telegram/<configId>).
 * Autenticação: o Telegram envia em TODO update o header X-Telegram-Bot-Api-Secret-Token com o
 * secret registrado no setWebhook — updates sem o secret correto são descartados.
 * SEMPRE responde 200 (evita reentrega em loop); erros são logados e absorvidos.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const runtime = await getTelegramRuntimeById(params.id);
    if (!runtime?.ativo || !runtime.botToken || !runtime.webhookSecret) {
      return NextResponse.json({ received: true }, { status: 200 });
    }
    const secret = request.headers.get("x-telegram-bot-api-secret-token")?.trim();
    if (secret !== runtime.webhookSecret) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const update = (await request.json().catch(() => null)) as { message?: unknown; callback_query?: unknown } | null;
    if (update?.callback_query) {
      // Clique em botão inline dos fluxos guiados.
      await processTelegramCallback(runtime, update.callback_query as Parameters<typeof processTelegramCallback>[1], baseUrlDe(request) || null);
    } else if (update?.message) {
      await processTelegramMessage(runtime, update.message as Parameters<typeof processTelegramMessage>[1], baseUrlDe(request) || null);
    }
  } catch (error) {
    console.error("[webhook/telegram] falha ao processar:", error instanceof Error ? error.message : "erro desconhecido");
  }
  return NextResponse.json({ received: true }, { status: 200 });
}

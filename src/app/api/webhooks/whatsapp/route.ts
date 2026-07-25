import { NextResponse } from "next/server";
import { processWhatsappMessage } from "@/domains/agent/runtime/process-whatsapp-message";
import { processWhatsappReceipt } from "@/domains/expenses/runtime/process-whatsapp-receipt";

export const dynamic = "force-dynamic";
export const maxDuration = 240;

const WHATSAPP_MESSAGE_TTL_MS = 30 * 60 * 1000;
const whatsappMessagesReceived = new Map<string, number>();

/** URL pública do sistema a partir dos headers do proxy (Traefik). */
function baseUrlDe(request: Request): string {
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host")?.trim() || "";
  return host ? `${proto}://${host}` : "";
}


/**
 * Webhook de entrada do WhatsApp (Z-API: "Ao receber"). SEMPRE responde 200, é tolerante a
 * payloads inesperados e absorve erros para evitar reentregas. A identidade (empresa/papel/cliente)
 * é resolvida pelo telefone.
 *
 * - Texto ou áudio → agente (processWhatsappMessage).
 * - Imagem (foto de cupom) → controle de gastos (processWhatsappReceipt).
 * Ignora mensagens enviadas pela própria conta (fromMe).
 */
type ZapiInbound = {
  phone?: string;
  instanceId?: string;
  messageId?: string;
  fromMe?: boolean;
  isGroup?: boolean;
  isNewsletter?: boolean;
  type?: string;
  text?: { message?: string } | null;
  image?: { imageUrl?: string; caption?: string } | null;
  audio?: { audioUrl?: string; mimeType?: string; seconds?: number; ptt?: boolean } | null;
};

function messageAlreadyReceived(instanceId: string | undefined, messageId: string | undefined): boolean {
  if (!instanceId || !messageId) return false;
  const now = Date.now();
  if (whatsappMessagesReceived.size > 500) {
    for (const [key, expiresAt] of whatsappMessagesReceived) {
      if (expiresAt <= now) whatsappMessagesReceived.delete(key);
    }
  }
  const key = `${instanceId}:${messageId}`;
  const expiresAt = whatsappMessagesReceived.get(key);
  if (expiresAt && expiresAt > now) return true;
  whatsappMessagesReceived.set(key, now + WHATSAPP_MESSAGE_TTL_MS);
  return false;
}

export async function POST(request: Request) {
  let body: ZapiInbound | null = null;
  try {
    body = (await request.json()) as ZapiInbound;
  } catch {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    const telefone = (body?.phone ?? "").trim();
    if (body?.fromMe || body?.isGroup || body?.isNewsletter || !telefone) {
      return NextResponse.json({ received: true }, { status: 200 });
    }
    if (messageAlreadyReceived(body.instanceId, body.messageId)) {
      console.info(`[webhook/whatsapp] mensagem duplicada ignorada: ${body.messageId}`);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const imageUrl = body?.image?.imageUrl?.trim() ?? "";
    if (imageUrl) {
      // Foto recebida → trata como cupom (controle de gastos).
      await processWhatsappReceipt({ telefone, imageUrl });
    } else {
      const texto = body?.text?.message?.trim() ?? "";
      const audioUrl = body?.audio?.audioUrl?.trim() ?? "";
      if (texto || audioUrl) {
        await processWhatsappMessage({
          telefone,
          texto,
          instanceId: body.instanceId,
          audio: audioUrl
            ? {
                url: audioUrl,
                mimeType: body.audio?.mimeType ?? null,
                seconds: body.audio?.seconds ?? null
              }
            : null,
          baseUrl: baseUrlDe(request) || null
        });
      }
    }
  } catch (error) {
    console.error("[webhook/whatsapp] falha ao processar:", error instanceof Error ? error.message : "erro desconhecido");
  }
  return NextResponse.json({ received: true }, { status: 200 });
}

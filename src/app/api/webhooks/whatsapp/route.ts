import { NextResponse } from "next/server";
import { processWhatsappMessage } from "@/domains/agent/runtime/process-whatsapp-message";

export const dynamic = "force-dynamic";

/**
 * Webhook de entrada do WhatsApp (Z-API: "Ao receber"). Espelha o padrão do
 * webhook da Spedy: SEMPRE responde 200, é tolerante a payloads inesperados e
 * absorve erros para evitar reentregas. A identidade (empresa/papel/cliente) é
 * resolvida pelo telefone dentro de processWhatsappMessage.
 *
 * Ignora mensagens enviadas pela própria conta (fromMe) e não-texto.
 */
type ZapiInbound = {
  phone?: string;
  fromMe?: boolean;
  type?: string;
  text?: { message?: string } | null;
};

export async function POST(request: Request) {
  let body: ZapiInbound | null = null;
  try {
    body = (await request.json()) as ZapiInbound;
  } catch {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    const telefone = (body?.phone ?? "").trim();
    const texto = body?.text?.message?.trim() ?? "";
    if (body?.fromMe || !telefone || !texto) {
      return NextResponse.json({ received: true }, { status: 200 });
    }
    await processWhatsappMessage({ telefone, texto });
  } catch (error) {
    console.error("[webhook/whatsapp] falha ao processar:", error instanceof Error ? error.message : "erro desconhecido");
  }
  return NextResponse.json({ received: true }, { status: 200 });
}

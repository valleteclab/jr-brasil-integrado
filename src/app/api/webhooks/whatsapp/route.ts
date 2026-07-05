import { NextResponse } from "next/server";
import { processWhatsappMessage } from "@/domains/agent/runtime/process-whatsapp-message";
import { processWhatsappReceipt } from "@/domains/expenses/runtime/process-whatsapp-receipt";

export const dynamic = "force-dynamic";

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
 * - Texto → agente (processWhatsappMessage).
 * - Imagem (foto de cupom) → controle de gastos (processWhatsappReceipt).
 * Ignora mensagens enviadas pela própria conta (fromMe).
 */
type ZapiInbound = {
  phone?: string;
  fromMe?: boolean;
  type?: string;
  text?: { message?: string } | null;
  image?: { imageUrl?: string; caption?: string } | null;
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
    if (body?.fromMe || !telefone) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const imageUrl = body?.image?.imageUrl?.trim() ?? "";
    if (imageUrl) {
      // Foto recebida → trata como cupom (controle de gastos).
      await processWhatsappReceipt({ telefone, imageUrl });
    } else {
      const texto = body?.text?.message?.trim() ?? "";
      if (texto) await processWhatsappMessage({ telefone, texto, baseUrl: baseUrlDe(request) || null });
    }
  } catch (error) {
    console.error("[webhook/whatsapp] falha ao processar:", error instanceof Error ? error.message : "erro desconhecido");
  }
  return NextResponse.json({ received: true }, { status: 200 });
}

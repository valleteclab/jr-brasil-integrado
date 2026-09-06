import { commercialEvolutionEnabled, commercialEvolutionRequest } from "@/lib/whatsapp/commercial-evolution";
import { sendZapiText, type ZapiCredentials } from "@/lib/whatsapp/zapi-client";

export async function sendCommercialWhatsappText(config: ZapiCredentials, phone: string, message: string) {
  if (!commercialEvolutionEnabled()) return sendZapiText(config, phone, message);
  try {
    await commercialEvolutionRequest("/message/sendText", { number: phone, text: message, linkPreview: false });
    return { ok: true };
  } catch {
    return { ok: false, error: "Falha no envio pelo WhatsApp próprio." };
  }
}

import { cloudApiEnabled, enviarTextoCloud } from "@/lib/whatsapp/cloud-api-client";
import { commercialEvolutionEnabled, commercialEvolutionRequest } from "@/lib/whatsapp/commercial-evolution";
import { sendZapiText, type ZapiCredentials } from "@/lib/whatsapp/zapi-client";

/**
 * Envio do agente comercial. Ordem: Cloud API oficial (divulgação em escala) → Evolution (nosso
 * WhatsApp Web) → Z-API. A mensagem livre só é entregue dentro da janela de 24h do contato; fora
 * dela, o canal exige template aprovado.
 */
export async function sendCommercialWhatsappText(config: ZapiCredentials, phone: string, message: string) {
  if (cloudApiEnabled()) {
    try {
      await enviarTextoCloud(phone, message);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Falha no envio pela Cloud API." };
    }
  }
  if (!commercialEvolutionEnabled()) return sendZapiText(config, phone, message);
  try {
    await commercialEvolutionRequest("/message/sendText", { number: phone, text: message, linkPreview: false });
    return { ok: true };
  } catch {
    return { ok: false, error: "Falha no envio pelo WhatsApp próprio." };
  }
}

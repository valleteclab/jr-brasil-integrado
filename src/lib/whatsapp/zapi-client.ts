/**
 * Transporte da Z-API (https://www.z-api.io) — provedor NÃO OFICIAL (conexão estilo WhatsApp
 * Web): aceita texto e documento livres, sem template. Credenciais chegam já descriptografadas
 * via whatsapp-service (getWhatsappRuntime). Nunca logar credenciais.
 *
 * Quem envia mensagem deve importar de "@/lib/whatsapp/whatsapp-service" (dispatcher por
 * provedor) — este módulo é só a implementação Z-API.
 */

export type ZapiCredentials = {
  instanceId: string | null;
  token: string | null;
  clientToken: string | null;
};

/** Envia uma mensagem de texto via Z-API. Retorna ok/erro sem lançar. */
export async function sendZapiText(
  config: ZapiCredentials,
  phone: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  if (!config.instanceId || !config.token) {
    return { ok: false, error: "WhatsApp (Z-API) não configurado." };
  }
  const url = `https://api.z-api.io/instances/${config.instanceId}/token/${config.token}/send-text`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.clientToken ? { "Client-Token": config.clientToken } : {})
      },
      body: JSON.stringify({ phone: phone.replace(/\D/g, ""), message })
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      return { ok: false, error: `Z-API HTTP ${res.status}${raw ? ` ${raw.slice(0, 160)}` : ""}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha de rede ao enviar WhatsApp." };
  }
}

/**
 * Envia um DOCUMENTO (ex.: PDF de boleto/DANFE) via Z-API. O arquivo vai em base64 (data URL) —
 * não precisa de URL pública. `extension` define o endpoint (send-document/{extension}).
 * Retorna ok/erro sem lançar.
 */
export async function sendZapiDocument(
  config: ZapiCredentials,
  phone: string,
  doc: { base64: string; fileName: string; extension?: string; caption?: string; mimeType?: string }
): Promise<{ ok: boolean; error?: string }> {
  if (!config.instanceId || !config.token) {
    return { ok: false, error: "WhatsApp (Z-API) não configurado." };
  }
  const extension = (doc.extension ?? "pdf").replace(/[^a-z0-9]/gi, "").toLowerCase() || "pdf";
  const mime = doc.mimeType ?? (extension === "pdf" ? "application/pdf" : `application/${extension}`);
  const url = `https://api.z-api.io/instances/${config.instanceId}/token/${config.token}/send-document/${extension}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.clientToken ? { "Client-Token": config.clientToken } : {})
      },
      body: JSON.stringify({
        phone: phone.replace(/\D/g, ""),
        document: `data:${mime};base64,${doc.base64}`,
        fileName: doc.fileName,
        ...(doc.caption ? { caption: doc.caption } : {})
      })
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      return { ok: false, error: `Z-API HTTP ${res.status}${raw ? ` ${raw.slice(0, 160)}` : ""}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha de rede ao enviar WhatsApp." };
  }
}

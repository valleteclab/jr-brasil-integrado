import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";

/** Configuração exclusiva do comercial da plataforma; nunca aceita instância do navegador. */
export function commercialEvolutionEnabled() {
  return process.env.COMMERCIAL_WHATSAPP_PROVIDER === "EVOLUTION";
}

function secret(name: string): string {
  const file = process.env[`${name}_FILE`];
  return (file ? readFileSync(file, "utf8") : process.env[name] || "").trim();
}

export function commercialEvolutionConfig() {
  const baseUrl = process.env.COMMERCIAL_EVOLUTION_URL?.replace(/\/+$/, "");
  const instance = process.env.COMMERCIAL_EVOLUTION_INSTANCE;
  const apiKey = secret("COMMERCIAL_EVOLUTION_API_KEY");
  const webhookSecret = secret("COMMERCIAL_EVOLUTION_WEBHOOK_SECRET");
  const publicUrl = process.env.ERP_BASE?.replace(/\/+$/, "");
  if (!baseUrl || !instance || !/^xerp-comercial-[a-z0-9-]{1,24}$/.test(instance) || !apiKey || !webhookSecret || !publicUrl) {
    throw new Error("WhatsApp próprio ainda não provisionado no servidor.");
  }
  return { baseUrl, instance, apiKey, webhookSecret, publicUrl };
}

export function validEvolutionSecret(received: string | null, expected: string): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function commercialEvolutionRequest<T>(path: string, body?: unknown): Promise<T> {
  const config = commercialEvolutionConfig();
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}/${encodeURIComponent(config.instance)}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { apikey: config.apiKey, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000), cache: "no-store", redirect: "error"
    });
  } catch {
    throw new Error("Não foi possível acessar o WhatsApp próprio. Tente novamente.");
  }
  if (!response.ok) throw new Error(`WhatsApp próprio retornou HTTP ${response.status}.`);
  return response.json() as Promise<T>;
}

export async function evolutionConnection(connect = false) {
  const config = commercialEvolutionConfig();
  if (connect) {
    await commercialEvolutionRequest("/webhook/set", { webhook: {
      enabled: true, url: `${config.publicUrl}/api/webhooks/comercial/evolution`,
      webhookByEvents: false, webhookBase64: false,
      headers: { "x-webhook-secret": config.webhookSecret }, events: ["MESSAGES_UPSERT"]
    } });
  }
  const state = await commercialEvolutionRequest<{ instance?: { state?: string } }>("/instance/connectionState");
  if (state.instance?.state === "open") return { status: "connected", qrCode: null };
  if (!connect) return { status: state.instance?.state === "connecting" ? "connecting" : "disconnected", qrCode: null };
  const qr = await commercialEvolutionRequest<{ base64?: string; code?: string }>("/instance/connect");
  // Renderizamos apenas PNG validado ou geramos o QR a partir do código retornado.
  let qrCode = qr.base64?.match(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/)?.[0] ?? null;
  if (!qrCode && qr.code) {
    const QRCode = await import("qrcode");
    qrCode = await QRCode.toDataURL(qr.code, { width: 280, margin: 2 });
  }
  return { status: "connecting", qrCode };
}

type RecordValue = Record<string, unknown>;
function record(v: unknown): RecordValue { return v !== null && typeof v === "object" && !Array.isArray(v) ? v as RecordValue : {}; }

/** Aceita só mensagens novas de contatos individuais, nunca histórico, grupos ou mensagens próprias. */
export function parseCommercialEvolutionInbound(payload: unknown, expectedInstance: string) {
  const root = record(payload);
  if (root.instance !== expectedInstance || root.event !== "messages.upsert") return null;
  const data = record(root.data), key = record(data.key);
  if (data.type !== undefined && data.type !== "notify") return null;
  if (key.fromMe !== false || typeof key.id !== "string" || !key.id || key.id.length > 120) return null;
  let jid = typeof key.remoteJid === "string" ? key.remoteJid : "";
  if (jid.endsWith("@lid")) jid = typeof key.remoteJidAlt === "string" ? key.remoteJidAlt : "";
  if (!/^\d{10,15}@s\.whatsapp\.net$/.test(jid)) return null;
  const message = record(data.message);
  const text = message.conversation ?? record(message.extendedTextMessage).text ?? record(message.imageMessage).caption;
  const audio = record(message.audioMessage);
  return {
    phone: jid.split("@")[0], messageId: `evo:${expectedInstance}:${key.id}`,
    text: typeof text === "string" ? text.slice(0, 4000).trim() : "",
    audio: Object.keys(audio).length ? { seconds: Number(audio.seconds || 0), key } : null
  };
}

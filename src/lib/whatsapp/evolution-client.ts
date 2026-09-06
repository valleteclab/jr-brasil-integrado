import { readFileSync } from "node:fs";
import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Transporte da EVOLUTION API (WhatsApp Web/Baileys) hospedada por nós — o provedor
 * "XERP WhatsApp" das EMPRESAS (agente operacional). Cada empresa tem a própria instância
 * (xerp-emp-*), com token e segredo de webhook exclusivos. A chave GLOBAL da Evolution só serve
 * para criar/apagar instâncias e nunca sai do servidor (Docker secret).
 *
 * Quem envia mensagem importa de "@/lib/whatsapp/whatsapp-service" (dispatcher por provedor) —
 * este módulo é só a implementação. Nunca logar credenciais.
 */

export type EvolutionCredentials = { instanceId: string | null; token: string | null };
export type EvolutionSendResult = { ok: boolean; error?: string };
export type EvolutionEstado = "connected" | "connecting" | "disconnected";

const INSTANCE_RE = /^xerp-emp-[a-z0-9]{6,40}$/;
const MAX_MEDIA_BASE64 = 8_388_608;

function secret(name: string): string {
  const file = process.env[`${name}_FILE`];
  return (file ? readFileSync(file, "utf8") : process.env[name] || "").trim();
}

/** Servidor provisionado (URL interna + chave global + URL pública do ERP para o webhook). */
export function evolutionOperacionalDisponivel(): boolean {
  return Boolean(process.env.WHATSAPP_EVOLUTION_URL && secret("WHATSAPP_EVOLUTION_API_KEY") && process.env.ERP_BASE);
}

function servidor() {
  const baseUrl = process.env.WHATSAPP_EVOLUTION_URL?.replace(/\/+$/, "");
  const globalKey = secret("WHATSAPP_EVOLUTION_API_KEY");
  const publicUrl = process.env.ERP_BASE?.replace(/\/+$/, "");
  if (!baseUrl || !globalKey || !publicUrl) throw new Error("WhatsApp próprio (Evolution) não está provisionado neste servidor.");
  return { baseUrl, globalKey, publicUrl };
}

export function instanciaEvolutionValida(instanceId: string | null | undefined): instanceId is string {
  return typeof instanceId === "string" && INSTANCE_RE.test(instanceId);
}

export function nomeInstanciaEvolution(empresaId: string): string {
  const nome = `xerp-emp-${empresaId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40)}`;
  if (!INSTANCE_RE.test(nome)) throw new Error("Identificador da empresa inválido para a instância do WhatsApp.");
  return nome;
}

async function request<T>(path: string, apiKey: string, body?: unknown, method?: "GET" | "POST" | "DELETE"): Promise<T> {
  const { baseUrl } = servidor();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000), cache: "no-store", redirect: "error"
    });
  } catch {
    throw new Error("Não foi possível acessar o WhatsApp próprio. Tente novamente.");
  }
  if (!response.ok) throw new Error(`WhatsApp próprio retornou HTTP ${response.status}.`);
  return response.json().catch(() => ({})) as Promise<T>;
}

function instanceRequest<T>(cred: EvolutionCredentials, path: string, body?: unknown, method?: "GET" | "POST" | "DELETE"): Promise<T> {
  if (!instanciaEvolutionValida(cred.instanceId) || !cred.token) {
    return Promise.reject(new Error("Instância do WhatsApp próprio não configurada para esta empresa."));
  }
  return request<T>(`${path}/${encodeURIComponent(cred.instanceId)}`, cred.token, body, method);
}

export async function configurarWebhookEvolution(cred: EvolutionCredentials, webhookSecret: string): Promise<void> {
  const { publicUrl } = servidor();
  await instanceRequest(cred, "/webhook/set", {
    webhook: {
      enabled: true,
      url: `${publicUrl}/api/webhooks/whatsapp/evolution`,
      webhookByEvents: false,
      webhookBase64: false,
      headers: { "x-webhook-secret": webhookSecret },
      events: ["MESSAGES_UPSERT"]
    }
  });
}

/**
 * Cria a instância dedicada da empresa com token e segredo gerados aqui e aponta o webhook
 * para o ERP. Uma instância órfã de mesmo nome (config perdida) é recriada para garantir que o
 * token em uso seja o nosso.
 */
export async function provisionarInstanciaEvolution(empresaId: string): Promise<{ instanceId: string; token: string; webhookSecret: string }> {
  const { globalKey } = servidor();
  const instanceId = nomeInstanciaEvolution(empresaId);
  const token = randomBytes(32).toString("hex");
  const webhookSecret = randomBytes(32).toString("hex");
  const lista = await request<Array<{ name?: string; instance?: { instanceName?: string } }>>("/instance/fetchInstances", globalKey);
  if (Array.isArray(lista) && lista.some((i) => (i.name ?? i.instance?.instanceName) === instanceId)) {
    await removerInstanciaEvolution(instanceId);
  }
  await request("/instance/create", globalKey, { instanceName: instanceId, integration: "WHATSAPP-BAILEYS", token, qrcode: false });
  await configurarWebhookEvolution({ instanceId, token }, webhookSecret);
  return { instanceId, token, webhookSecret };
}

export async function removerInstanciaEvolution(instanceId: string): Promise<void> {
  if (!instanciaEvolutionValida(instanceId)) throw new Error("Instância inválida.");
  const { globalKey } = servidor();
  try { await request(`/instance/logout/${encodeURIComponent(instanceId)}`, globalKey, undefined, "DELETE"); } catch { /* já desconectada */ }
  await request(`/instance/delete/${encodeURIComponent(instanceId)}`, globalKey, undefined, "DELETE");
}

/** Estado da conexão; com `connect`, inicia o pareamento e devolve o QR Code (PNG data URL). */
export async function conexaoEvolution(cred: EvolutionCredentials, connect = false): Promise<{ status: EvolutionEstado; qrCode: string | null }> {
  const state = await instanceRequest<{ instance?: { state?: string } }>(cred, "/instance/connectionState");
  if (state.instance?.state === "open") return { status: "connected", qrCode: null };
  if (!connect) return { status: state.instance?.state === "connecting" ? "connecting" : "disconnected", qrCode: null };
  let qr = await instanceRequest<{ base64?: string; code?: string }>(cred, "/instance/connect");
  // A primeira conexão pode responder antes do evento de QR do Baileys.
  for (let attempt = 0; attempt < 3 && !qr.base64 && !qr.code; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    qr = await instanceRequest<{ base64?: string; code?: string }>(cred, "/instance/connect");
  }
  // Só PNG validado ou QR gerado por nós a partir do código.
  let qrCode = qr.base64?.match(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/)?.[0] ?? null;
  if (!qrCode && qr.code) {
    const QRCode = await import("qrcode");
    qrCode = await QRCode.toDataURL(qr.code, { width: 280, margin: 2 });
  }
  return { status: "connecting", qrCode };
}

export async function desconectarEvolution(cred: EvolutionCredentials): Promise<void> {
  await instanceRequest(cred, "/instance/logout", undefined, "DELETE");
}

function falha(error: unknown): EvolutionSendResult {
  return { ok: false, error: error instanceof Error ? error.message : "Falha no envio pelo WhatsApp próprio." };
}

export async function sendEvolutionText(cred: EvolutionCredentials, phone: string, message: string): Promise<EvolutionSendResult> {
  try {
    await instanceRequest(cred, "/message/sendText", { number: phone.replace(/\D/g, ""), text: message, linkPreview: false });
    return { ok: true };
  } catch (error) { return falha(error); }
}

/** Áudio (MP3 do Kokoro) em base64 como mensagem de voz (PTT). */
export async function sendEvolutionAudio(cred: EvolutionCredentials, phone: string, audio: Buffer): Promise<EvolutionSendResult> {
  if (!audio.length) return { ok: false, error: "Áudio vazio." };
  try {
    await instanceRequest(cred, "/message/sendWhatsAppAudio", { number: phone.replace(/\D/g, ""), audio: audio.toString("base64"), encoding: true });
    return { ok: true };
  } catch (error) { return falha(error); }
}

export async function sendEvolutionDocument(
  cred: EvolutionCredentials,
  phone: string,
  doc: { base64: string; fileName: string; caption?: string; mimeType?: string }
): Promise<EvolutionSendResult> {
  try {
    await instanceRequest(cred, "/message/sendMedia", {
      number: phone.replace(/\D/g, ""),
      mediatype: "document",
      mimetype: doc.mimeType ?? "application/pdf",
      caption: doc.caption ?? "",
      media: doc.base64,
      fileName: doc.fileName
    });
    return { ok: true };
  } catch (error) { return falha(error); }
}

/** Baixa a mídia de uma mensagem recebida pela API autenticada (nunca por URL pública). */
export async function baixarMidiaEvolution(cred: EvolutionCredentials, key: unknown): Promise<{ buffer: Buffer; mimeType: string | null } | null> {
  const media = await instanceRequest<{ base64?: string; mimetype?: string }>(cred, "/chat/getBase64FromMediaMessage", { message: { key }, convertToMp4: false });
  if (!media.base64 || media.base64.length > MAX_MEDIA_BASE64) return null;
  return { buffer: Buffer.from(media.base64, "base64"), mimeType: media.mimetype ?? null };
}

export function validEvolutionWebhookSecret(received: string | null, expected: string | null): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type RecordValue = Record<string, unknown>;
function record(v: unknown): RecordValue { return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as RecordValue) : {}; }

export type EvolutionInbound = {
  instance: string;
  phone: string;
  messageId: string;
  text: string;
  audio: { seconds: number; key: RecordValue } | null;
  image: { key: RecordValue; caption: string } | null;
};

/** Aceita só mensagens novas de contatos individuais de uma instância xerp-emp-*; nunca histórico, grupos ou mensagens próprias. */
export function parseEvolutionInbound(payload: unknown): EvolutionInbound | null {
  const root = record(payload);
  if (!instanciaEvolutionValida(root.instance as string) || root.event !== "messages.upsert") return null;
  const data = record(root.data), key = record(data.key);
  if (data.type !== undefined && data.type !== "notify") return null;
  if (key.fromMe !== false || typeof key.id !== "string" || !key.id || key.id.length > 120) return null;
  let jid = typeof key.remoteJid === "string" ? key.remoteJid : "";
  if (jid.endsWith("@lid")) jid = typeof key.remoteJidAlt === "string" ? key.remoteJidAlt : "";
  if (!/^\d{10,15}@s\.whatsapp\.net$/.test(jid)) return null;
  const message = record(data.message);
  const text = message.conversation ?? record(message.extendedTextMessage).text;
  const audio = record(message.audioMessage);
  const image = record(message.imageMessage);
  return {
    instance: root.instance as string,
    phone: jid.split("@")[0],
    messageId: `evo:${root.instance}:${key.id}`,
    text: typeof text === "string" ? text.slice(0, 4000).trim() : "",
    audio: Object.keys(audio).length ? { seconds: Number(audio.seconds || 0), key } : null,
    image: Object.keys(image).length ? { key, caption: typeof image.caption === "string" ? image.caption.slice(0, 500) : "" } : null
  };
}

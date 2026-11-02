import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * WHATSAPP CLOUD API (oficial da Meta) — canal comercial.
 *
 * Por que existe, ao lado da Evolution: a Evolution é WhatsApp Web automatizado e serve bem ao
 * uso operacional de cada cliente, mas não aguenta divulgação nacional — centenas de conversas
 * iniciadas por desconhecidos num chip não aquecido é o padrão que a Meta bane. A Cloud API é o
 * canal oficial, e é o ÚNICO que entrega a atribuição do anúncio Click-to-WhatsApp (o campo
 * `referral`, com o `ctwa_clid`), que é o que torna a campanha mensurável.
 *
 * Regras do canal que o código respeita:
 *  - fora da janela de 24h desde a última mensagem do contato, só TEMPLATE aprovado;
 *  - dentro da janela, mensagem livre;
 *  - o webhook é verificado por assinatura HMAC (X-Hub-Signature-256) com o app secret.
 *
 * Credenciais por ambiente (nunca em banco, nunca logadas):
 *   COMMERCIAL_CLOUD_PHONE_ID · COMMERCIAL_CLOUD_TOKEN(_FILE) ·
 *   COMMERCIAL_CLOUD_VERIFY_TOKEN(_FILE) · COMMERCIAL_CLOUD_APP_SECRET(_FILE)
 */

const GRAPH = "https://graph.facebook.com/v21.0";

function secret(nome: string): string {
  const arquivo = process.env[`${nome}_FILE`];
  return (arquivo ? readFileSync(arquivo, "utf8") : process.env[nome] || "").trim();
}

export function cloudApiEnabled(): boolean {
  return (process.env.COMMERCIAL_WHATSAPP_PROVIDER || "").toUpperCase() === "CLOUD" && Boolean(process.env.COMMERCIAL_CLOUD_PHONE_ID);
}

export function cloudApiConfig() {
  return {
    phoneNumberId: (process.env.COMMERCIAL_CLOUD_PHONE_ID || "").trim(),
    token: secret("COMMERCIAL_CLOUD_TOKEN"),
    verifyToken: secret("COMMERCIAL_CLOUD_VERIFY_TOKEN"),
    appSecret: secret("COMMERCIAL_CLOUD_APP_SECRET")
  };
}

async function graph<T>(path: string, body: unknown): Promise<T> {
  const { token } = cloudApiConfig();
  const res = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const texto = await res.text();
  if (!res.ok) {
    // A mensagem da Meta vem em JSON; devolvemos só o essencial (sem token, sem corpo inteiro).
    let detalhe = texto.slice(0, 300);
    try {
      const j = JSON.parse(texto) as { error?: { message?: string; code?: number; error_subcode?: number } };
      if (j.error?.message) detalhe = `${j.error.message}${j.error.code ? ` (código ${j.error.code})` : ""}`;
    } catch { /* corpo não-JSON */ }
    throw new Error(`WhatsApp Cloud API: ${detalhe}`);
  }
  return (texto ? JSON.parse(texto) : {}) as T;
}

/** Só dígitos com DDI (o Cloud API aceita o número no formato internacional sem "+"). */
const normalizar = (telefone: string) => telefone.replace(/\D/g, "");

/** Mensagem livre — só é entregue dentro da janela de 24h desde a última mensagem do contato. */
export async function enviarTextoCloud(telefone: string, texto: string): Promise<{ messageId: string | null }> {
  const { phoneNumberId } = cloudApiConfig();
  const r = await graph<{ messages?: Array<{ id?: string }> }>(`${phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizar(telefone),
    type: "text",
    text: { preview_url: false, body: texto.slice(0, 4096) }
  });
  return { messageId: r.messages?.[0]?.id ?? null };
}

/** Template aprovado — é o que vale fora da janela de 24h (primeiro contato, follow-up). */
export async function enviarTemplateCloud(
  telefone: string,
  template: { nome: string; idioma?: string; parametros?: string[] }
): Promise<{ messageId: string | null }> {
  const { phoneNumberId } = cloudApiConfig();
  const componentes = template.parametros?.length
    ? [{ type: "body", parameters: template.parametros.map((p) => ({ type: "text", text: p })) }]
    : undefined;
  const r = await graph<{ messages?: Array<{ id?: string }> }>(`${phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    to: normalizar(telefone),
    type: "template",
    template: {
      name: template.nome,
      language: { code: template.idioma || "pt_BR" },
      ...(componentes ? { components: componentes } : {})
    }
  });
  return { messageId: r.messages?.[0]?.id ?? null };
}

/** Marca a mensagem como lida (o "visto" no app do contato). Falha aqui não é erro de negócio. */
export async function marcarLidaCloud(messageId: string): Promise<void> {
  const { phoneNumberId } = cloudApiConfig();
  await graph(`${phoneNumberId}/messages`, { messaging_product: "whatsapp", status: "read", message_id: messageId }).catch(() => undefined);
}

/** Baixa a mídia (áudio do lead): a URL do Graph exige o mesmo token no download. */
export async function baixarMidiaCloud(mediaId: string): Promise<{ buffer: Buffer; mimeType: string | null } | null> {
  const { token } = cloudApiConfig();
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!meta.ok) return null;
  const { url, mime_type } = (await meta.json()) as { url?: string; mime_type?: string };
  if (!url) return null;
  const bin = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!bin.ok) return null;
  return { buffer: Buffer.from(await bin.arrayBuffer()), mimeType: mime_type ?? null };
}

/** Assinatura do webhook (X-Hub-Signature-256) conferida em tempo constante. */
export function assinaturaCloudValida(corpoBruto: string, cabecalho: string | null): boolean {
  const { appSecret } = cloudApiConfig();
  if (!appSecret) return false;
  const recebida = (cabecalho || "").replace(/^sha256=/i, "").trim();
  if (!recebida) return false;
  const esperada = createHmac("sha256", appSecret).update(corpoBruto, "utf8").digest("hex");
  const a = Buffer.from(recebida, "hex");
  const b = Buffer.from(esperada, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Atribuição do anúncio: quando o contato chega por um anúncio Click-to-WhatsApp, a Meta manda o
 * bloco `referral` na PRIMEIRA mensagem. É o que liga o lead ao criativo sem depender do texto.
 */
export type ReferralCloud = {
  /** Identificador do clique — o que fecha o funil com o gerenciador de anúncios. */
  ctwaClid: string | null;
  /** ID do anúncio/post de origem. */
  sourceId: string | null;
  sourceType: string | null;
  sourceUrl: string | null;
  titulo: string | null;
};

export type MensagemCloud = {
  telefone: string;
  nome: string | null;
  messageId: string;
  texto: string;
  audio: { mediaId: string; seconds: number } | null;
  referral: ReferralCloud | null;
};

/** Lê o payload do webhook e devolve as mensagens recebidas (ignora status de entrega). */
export function parseWebhookCloud(payload: unknown): MensagemCloud[] {
  const corpo = payload as {
    entry?: Array<{
      changes?: Array<{
        field?: string;
        value?: {
          contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
          messages?: Array<{
            from?: string;
            id?: string;
            type?: string;
            text?: { body?: string };
            audio?: { id?: string };
            voice?: boolean;
            button?: { text?: string };
            interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
            referral?: {
              ctwa_clid?: string;
              source_id?: string;
              source_type?: string;
              source_url?: string;
              headline?: string;
              body?: string;
            };
          }>;
        };
      }>;
    }>;
  };

  const mensagens: MensagemCloud[] = [];
  for (const entry of corpo.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field && change.field !== "messages") continue;
      const valor = change.value;
      const nome = valor?.contacts?.[0]?.profile?.name ?? null;
      for (const m of valor?.messages ?? []) {
        if (!m.from || !m.id) continue;
        const texto =
          m.text?.body ??
          m.button?.text ??
          m.interactive?.button_reply?.title ??
          m.interactive?.list_reply?.title ??
          "";
        const ref = m.referral;
        mensagens.push({
          telefone: m.from,
          nome,
          messageId: m.id,
          texto: texto.trim(),
          audio: m.audio?.id ? { mediaId: m.audio.id, seconds: 0 } : null,
          referral: ref
            ? {
                ctwaClid: ref.ctwa_clid ?? null,
                sourceId: ref.source_id ?? null,
                sourceType: ref.source_type ?? null,
                sourceUrl: ref.source_url ?? null,
                titulo: ref.headline ?? ref.body ?? null
              }
            : null
        });
      }
    }
  }
  return mensagens;
}

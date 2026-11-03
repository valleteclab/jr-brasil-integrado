import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";

/**
 * CHATWOOT — integração do agente comercial com o inbox do time.
 *
 * O número oficial (Cloud API) pertence ao projeto SISGOV e já vive no Chatwoot, que é onde o
 * atendimento humano acontece. Em vez de disputar o webhook do WhatsApp — que é um só por conta —
 * o ERP entra como **agent bot**: recebe os eventos do Chatwoot, responde pela API dele e, quando
 * o assunto exige gente, devolve a conversa para a fila com uma nota interna.
 *
 * Ganhos dessa escolha: histórico num lugar só, atendente assume sem fricção, e nenhum risco de
 * o bot e o humano responderem por canais diferentes.
 *
 * Credenciais por ambiente (nunca no banco, nunca logadas):
 *   CHATWOOT_URL · CHATWOOT_ACCOUNT_ID · CHATWOOT_BOT_TOKEN(_FILE) · CHATWOOT_WEBHOOK_SECRET(_FILE)
 *   CHATWOOT_INBOX_IDS (opcional: só estes inboxes são atendidos pelo agente)
 */

function segredo(nome: string): string {
  const arquivo = process.env[`${nome}_FILE`];
  return (arquivo ? readFileSync(arquivo, "utf8") : process.env[nome] || "").trim();
}

export function chatwootEnabled(): boolean {
  return Boolean(process.env.CHATWOOT_URL && process.env.CHATWOOT_ACCOUNT_ID && segredo("CHATWOOT_BOT_TOKEN"));
}

export function chatwootConfig() {
  return {
    baseUrl: (process.env.CHATWOOT_URL || "").replace(/\/+$/, ""),
    accountId: (process.env.CHATWOOT_ACCOUNT_ID || "").trim(),
    token: segredo("CHATWOOT_BOT_TOKEN"),
    webhookSecret: segredo("CHATWOOT_WEBHOOK_SECRET"),
    /** Vazio = atende todos os inboxes; preenchido = só os listados (ex.: "1,4"). */
    inboxes: (process.env.CHATWOOT_INBOX_IDS || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
  };
}

/** Compara o segredo do webhook em tempo constante (o endpoint é público). */
export function segredoChatwootValido(recebido: string | null): boolean {
  const { webhookSecret } = chatwootConfig();
  if (!webhookSecret) return false;
  const a = Buffer.from(recebido ?? "", "utf8");
  const b = Buffer.from(webhookSecret, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function api<T>(caminho: string, init: { method: string; body?: unknown }): Promise<T> {
  const { baseUrl, accountId, token } = chatwootConfig();
  const res = await fetch(`${baseUrl}/api/v1/accounts/${accountId}${caminho}`, {
    method: init.method,
    headers: { api_access_token: token, "Content-Type": "application/json" },
    ...(init.body ? { body: JSON.stringify(init.body) } : {})
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`Chatwoot ${res.status}: ${texto.slice(0, 200)}`);
  return (texto ? JSON.parse(texto) : {}) as T;
}

/** Resposta do agente, visível para o contato. */
export async function enviarMensagemChatwoot(conversationId: number, conteudo: string): Promise<{ id: number | null }> {
  const r = await api<{ id?: number }>(`/conversations/${conversationId}/messages`, {
    method: "POST",
    body: { content: conteudo.slice(0, 4096), message_type: "outgoing" }
  });
  return { id: r.id ?? null };
}

/** Nota interna — só o time vê. Usada no handoff, para o atendente saber o que já foi dito. */
export async function notaInternaChatwoot(conversationId: number, conteudo: string): Promise<void> {
  await api(`/conversations/${conversationId}/messages`, {
    method: "POST",
    body: { content: conteudo.slice(0, 4096), message_type: "outgoing", private: true }
  }).catch(() => undefined);
}

/**
 * Devolve a conversa para a fila humana. "open" tira do bot e deixa visível para os atendentes;
 * o Chatwoot mantém o histórico do que o agente já respondeu.
 */
export async function devolverParaHumanoChatwoot(conversationId: number, motivo?: string): Promise<void> {
  if (motivo) await notaInternaChatwoot(conversationId, `🤖 Agente XERP passou para atendimento humano: ${motivo}`);
  await api(`/conversations/${conversationId}/toggle_status`, { method: "POST", body: { status: "open" } }).catch(() => undefined);
}

export type EventoChatwoot = {
  tipo: "mensagem" | "outro";
  conversationId: number;
  inboxId: number | null;
  /** Telefone do contato (identifier/phone_number do Chatwoot), só dígitos. */
  telefone: string | null;
  nome: string | null;
  mensagemId: number | null;
  conteudo: string;
  /** Anexo de áudio, quando o contato manda voz. */
  audioUrl: string | null;
  /** Atribuição do anúncio, quando o Chatwoot a repassa nos atributos da conversa. */
  referral: { sourceId: string | null; titulo: string | null; sourceUrl: string | null } | null;
};

/**
 * Lê o payload do webhook do Chatwoot. Só nos interessa `message_created` de entrada: mensagem
 * de saída é a nossa própria (ou a do atendente) e reprocessá-la criaria eco.
 */
export function parseEventoChatwoot(payload: unknown): EventoChatwoot | null {
  const p = payload as {
    event?: string;
    message_type?: string;
    id?: number;
    content?: string;
    conversation?: {
      id?: number;
      inbox_id?: number;
      additional_attributes?: Record<string, unknown>;
      meta?: { sender?: { name?: string; phone_number?: string; identifier?: string } };
    };
    inbox?: { id?: number };
    sender?: { name?: string; phone_number?: string; identifier?: string; type?: string };
    attachments?: Array<{ file_type?: string; data_url?: string }>;
  };

  if (p.event !== "message_created") return null;
  // message_type: "incoming" (contato) | "outgoing" (nós/atendente) | "template".
  if (p.message_type !== "incoming") return null;

  const conversationId = p.conversation?.id;
  if (!conversationId) return null;

  const remetente = p.sender ?? p.conversation?.meta?.sender;
  const telefoneBruto = remetente?.phone_number ?? remetente?.identifier ?? "";
  const audio = (p.attachments ?? []).find((a) => a.file_type === "audio")?.data_url ?? null;

  const extras = p.conversation?.additional_attributes ?? {};
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const referral =
    texto(extras.campaign_id) || texto(extras.referer) || texto(extras.ad_id)
      ? {
          sourceId: texto(extras.ad_id) ?? texto(extras.campaign_id),
          titulo: texto(extras.headline) ?? texto(extras.campaign_name),
          sourceUrl: texto(extras.referer)
        }
      : null;

  return {
    tipo: "mensagem",
    conversationId,
    inboxId: p.conversation?.inbox_id ?? p.inbox?.id ?? null,
    telefone: telefoneBruto.replace(/\D/g, "") || null,
    nome: remetente?.name ?? null,
    mensagemId: p.id ?? null,
    conteudo: (p.content ?? "").trim(),
    audioUrl: audio,
    referral
  };
}

/** O inbox está sob responsabilidade do agente? (vazio em CHATWOOT_INBOX_IDS = todos). */
export function inboxAtendido(inboxId: number | null): boolean {
  const { inboxes } = chatwootConfig();
  if (inboxes.length === 0) return true;
  return inboxId != null && inboxes.includes(String(inboxId));
}

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { decryptSecret, encryptSecret } from "@/lib/security/secret-crypto";

/**
 * Bot do Telegram (Bot API oficial) — mesmo agente do WhatsApp/web, canal TELEGRAM.
 * O token vem do BotFather e fica criptografado; ao salvar, validamos com getMe e registramos o
 * webhook (setWebhook) com secret_token, que o Telegram devolve no header
 * X-Telegram-Bot-Api-Secret-Token de cada update (é a autenticação do webhook).
 */

const API = "https://api.telegram.org";

export type TelegramRuntime = {
  configId: string;
  ativo: boolean;
  atenderClientes: boolean;
  botToken: string | null;
  botUsername: string | null;
  webhookSecret: string | null;
};

/** Config efetiva (token descriptografado) da empresa. */
export async function getTelegramRuntime(scope: TenantScope): Promise<TelegramRuntime | null> {
  const cfg = await prisma.configuracaoTelegram.findUnique({ where: { empresaId: scope.empresaId } });
  if (!cfg || cfg.tenantId !== scope.tenantId) return null;
  return {
    configId: cfg.id,
    ativo: cfg.ativo,
    atenderClientes: cfg.atenderClientes,
    botToken: cfg.botTokenCripto ? decryptSecret(cfg.botTokenCripto) : null,
    botUsername: cfg.botUsername,
    webhookSecret: cfg.webhookSecret
  };
}

/** Config pelo id (rota do webhook, que não tem sessão). */
export async function getTelegramRuntimeById(configId: string): Promise<(TelegramRuntime & { tenantId: string; empresaId: string }) | null> {
  const cfg = await prisma.configuracaoTelegram.findUnique({ where: { id: configId } });
  if (!cfg) return null;
  return {
    configId: cfg.id,
    tenantId: cfg.tenantId,
    empresaId: cfg.empresaId,
    ativo: cfg.ativo,
    atenderClientes: cfg.atenderClientes,
    botToken: cfg.botTokenCripto ? decryptSecret(cfg.botTokenCripto) : null,
    botUsername: cfg.botUsername,
    webhookSecret: cfg.webhookSecret
  };
}

async function tgCall<T>(token: string, metodo: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API}/bot${token}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!res.ok || !body.ok) throw new Error(body.description || `Telegram ${metodo} falhou (HTTP ${res.status}).`);
  return body.result as T;
}

/** Envia texto para um chat. Sem parse_mode (evita quebrar com _ e * de SKUs); quebra em 4096. */
export async function sendTelegramText(runtime: TelegramRuntime, chatId: string, texto: string): Promise<void> {
  if (!runtime.botToken) return;
  const partes: string[] = [];
  let resto = texto.trim();
  while (resto.length > 4096) { partes.push(resto.slice(0, 4096)); resto = resto.slice(4096); }
  if (resto) partes.push(resto);
  for (const parte of partes) {
    await tgCall(runtime.botToken, "sendMessage", { chat_id: chatId, text: parte });
  }
}

/** Pede o contato do usuário com o botão nativo do Telegram (contato verificado). */
export async function sendTelegramPedirContato(runtime: TelegramRuntime, chatId: string, texto: string): Promise<void> {
  if (!runtime.botToken) return;
  await tgCall(runtime.botToken, "sendMessage", {
    chat_id: chatId,
    text: texto,
    reply_markup: {
      keyboard: [[{ text: "📱 Compartilhar meu número", request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  });
}

/** Remove o teclado de contato após o vínculo. */
export async function sendTelegramTextoSemTeclado(runtime: TelegramRuntime, chatId: string, texto: string): Promise<void> {
  if (!runtime.botToken) return;
  await tgCall(runtime.botToken, "sendMessage", { chat_id: chatId, text: texto, reply_markup: { remove_keyboard: true } });
}

/**
 * Salva a config: criptografa o token (vazio = mantém o atual), valida com getMe e registra o
 * webhook com secret novo. Retorna o username do bot.
 */
export async function saveTelegramConfig(
  scope: TenantScope,
  input: { ativo: boolean; atenderClientes: boolean; botToken?: string | null },
  baseUrl: string
): Promise<{ botUsername: string | null; ativo: boolean }> {
  const atual = await prisma.configuracaoTelegram.findUnique({ where: { empresaId: scope.empresaId } });
  const tokenNovo = input.botToken?.trim() || "";
  const token = tokenNovo || (atual?.botTokenCripto ? decryptSecret(atual.botTokenCripto) : "");

  let botUsername: string | null = atual?.botUsername ?? null;
  let webhookSecret: string | null = atual?.webhookSecret ?? null;

  if (input.ativo) {
    if (!token) throw new Error("Informe o token do bot (crie um bot com o @BotFather no Telegram).");
    // Valida o token e captura o @username do bot.
    const me = await tgCall<{ username?: string }>(token, "getMe", {});
    botUsername = me.username ? `@${me.username}` : null;
    // Registra o webhook com secret novo (o Telegram passa a enviar os updates pra cá).
    webhookSecret = randomBytes(24).toString("hex");
    const cfgId = atual?.id ?? (await prisma.configuracaoTelegram.create({
      data: { tenantId: scope.tenantId, empresaId: scope.empresaId, ativo: false }
    })).id;
    await tgCall(token, "setWebhook", {
      url: `${baseUrl}/api/webhooks/telegram/${cfgId}`,
      secret_token: webhookSecret,
      allowed_updates: ["message"]
    });
    await prisma.configuracaoTelegram.update({
      where: { id: cfgId },
      data: {
        ativo: true,
        atenderClientes: input.atenderClientes,
        botUsername,
        webhookSecret,
        ...(tokenNovo ? { botTokenCripto: encryptSecret(tokenNovo) } : {})
      }
    });
    return { botUsername, ativo: true };
  }

  // Desativar: remove o webhook (se houver token) e marca inativo.
  if (atual) {
    if (token) await tgCall(token, "deleteWebhook", {}).catch(() => undefined);
    await prisma.configuracaoTelegram.update({
      where: { id: atual.id },
      data: { ativo: false, atenderClientes: input.atenderClientes, ...(tokenNovo ? { botTokenCripto: encryptSecret(tokenNovo) } : {}) }
    });
  }
  return { botUsername, ativo: false };
}

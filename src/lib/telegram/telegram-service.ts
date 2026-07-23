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
 * Baixa um arquivo enviado ao bot como Buffer (cap 6MB). Fluxo da Bot API:
 * getFile(file_id) → file_path → GET /file/bot<token>/<file_path>.
 * Retorna null em qualquer falha (o chamador responde pedindo reenvio).
 */
export async function baixarTelegramArquivoBuffer(
  runtime: TelegramRuntime,
  fileId: string
): Promise<{ buffer: Buffer; filePath: string } | null> {
  if (!runtime.botToken || !fileId) return null;
  try {
    const info = await tgCall<{ file_path?: string; file_size?: number }>(runtime.botToken, "getFile", { file_id: fileId });
    if (!info.file_path) return null;
    if (info.file_size && info.file_size > 6 * 1024 * 1024) return null;
    const res = await fetch(`${API}/file/bot${runtime.botToken}/${info.file_path}`);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > 6 * 1024 * 1024) return null;
    return { buffer: buf, filePath: info.file_path };
  } catch {
    return null;
  }
}

/** Baixa uma FOTO enviada ao bot como data URL base64 (cupom de gasto). */
export async function baixarTelegramArquivoBase64(runtime: TelegramRuntime, fileId: string): Promise<string | null> {
  const arq = await baixarTelegramArquivoBuffer(runtime, fileId);
  if (!arq) return null;
  const ext = arq.filePath.split(".").pop()?.toLowerCase() ?? "";
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${arq.buffer.toString("base64")}`;
}

export type BotaoInline = { text: string; data: string };

/** Mensagem com BOTÕES inline (fluxos guiados sem IA). `data` volta no callback_query (máx 64 bytes). */
export async function sendTelegramBotoes(
  runtime: TelegramRuntime,
  chatId: string,
  texto: string,
  botoes: BotaoInline[][]
): Promise<void> {
  if (!runtime.botToken) return;
  await tgCall(runtime.botToken, "sendMessage", {
    chat_id: chatId,
    text: texto,
    reply_markup: { inline_keyboard: botoes.map((linha) => linha.map((b) => ({ text: b.text, callback_data: b.data }))) }
  });
}

/** Confirma o recebimento de um callback (tira o "reloginho" do botão). Nunca lança. */
export async function answerTelegramCallback(runtime: TelegramRuntime, callbackId: string): Promise<void> {
  if (!runtime.botToken || !callbackId) return;
  await tgCall(runtime.botToken, "answerCallbackQuery", { callback_query_id: callbackId }).catch(() => undefined);
}

/** Envia uma FOTO (ex.: QR Code Pix) direto no chat. */
export async function sendTelegramPhoto(
  runtime: TelegramRuntime,
  chatId: string,
  filename: string,
  png: Buffer,
  legenda?: string
): Promise<void> {
  if (!runtime.botToken) return;
  const form = new FormData();
  form.append("chat_id", chatId);
  if (legenda) form.append("caption", legenda.slice(0, 1024));
  form.append("photo", new Blob([new Uint8Array(png)], { type: "image/png" }), filename);
  const res = await fetch(`${API}/bot${runtime.botToken}/sendPhoto`, { method: "POST", body: form });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!res.ok || !body.ok) throw new Error(body.description || `Telegram sendPhoto falhou (HTTP ${res.status}).`);
}

/** Envia um ARQUIVO (ex.: PDF de nota/boleto) direto no chat — links do ERP exigem login. */
export async function sendTelegramDocument(
  runtime: TelegramRuntime,
  chatId: string,
  filename: string,
  conteudo: Buffer,
  legenda?: string
): Promise<void> {
  if (!runtime.botToken) return;
  const form = new FormData();
  form.append("chat_id", chatId);
  if (legenda) form.append("caption", legenda.slice(0, 1024));
  form.append("document", new Blob([new Uint8Array(conteudo)], { type: "application/pdf" }), filename);
  const res = await fetch(`${API}/bot${runtime.botToken}/sendDocument`, { method: "POST", body: form });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!res.ok || !body.ok) throw new Error(body.description || `Telegram sendDocument falhou (HTTP ${res.status}).`);
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
      // callback_query = cliques nos botões inline dos fluxos guiados.
      allowed_updates: ["message", "callback_query"]
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

import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { decryptSecret, encryptSecret, secretLastChars } from "@/lib/security/secret-crypto";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** Mensagem no formato OpenAI/OpenRouter, incluindo tool calls e mensagens de tool. */
export type ToolChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

/** Mensagem retornada pelo modelo numa chamada com tools. */
export type AssistantToolMessage = {
  role: "assistant";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

type SaveAiConfigInput = {
  apiKey?: string;
  model: string;
  enabled: boolean;
  notes?: string;
};

export type AiConfigSummary = {
  provider: "OPENROUTER";
  enabled: boolean;
  model: string;
  keyLast4: string | null;
  notes: string | null;
  testedAt: string | null;
  lastError: string | null;
  configured: boolean;
};

function sanitizeModel(model: string) {
  const value = model.trim();

  if (!value) {
    throw new Error("Informe o modelo da OpenRouter.");
  }

  return value;
}

function toSummary(config: {
  ativo: boolean;
  modelo: string;
  chaveFinal: string | null;
  observacoes: string | null;
  testadoEm: Date | null;
  ultimoErro: string | null;
} | null): AiConfigSummary {
  return {
    provider: "OPENROUTER",
    enabled: config?.ativo ?? false,
    model: config?.modelo ?? "openai/gpt-4o-mini",
    keyLast4: config?.chaveFinal ?? null,
    notes: config?.observacoes ?? null,
    testedAt: config?.testadoEm?.toISOString() ?? null,
    lastError: config?.ultimoErro ?? null,
    configured: Boolean(config?.chaveFinal)
  };
}

export async function getAiConfig(scope: TenantScope) {
  const config = await prisma.configuracaoIa.findUnique({
    where: {
      tenantId_empresaId_provedor: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        provedor: "OPENROUTER"
      }
    }
  });

  return toSummary(config);
}

export async function saveAiConfig(scope: TenantScope, input: SaveAiConfigInput) {
  const model = sanitizeModel(input.model);
  const apiKey = input.apiKey?.trim();
  const existing = await prisma.configuracaoIa.findUnique({
    where: {
      tenantId_empresaId_provedor: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        provedor: "OPENROUTER"
      }
    }
  });

  if (!existing && !apiKey) {
    throw new Error("Informe a chave da OpenRouter para ativar a IA.");
  }

  const secretData = apiKey
    ? {
        chaveCriptografada: encryptSecret(apiKey),
        chaveFinal: secretLastChars(apiKey)
      }
    : {};

  const config = await prisma.configuracaoIa.upsert({
    where: {
      tenantId_empresaId_provedor: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        provedor: "OPENROUTER"
      }
    },
    update: {
      ativo: input.enabled,
      modelo: model,
      observacoes: input.notes?.trim() || null,
      ultimoErro: null,
      ...secretData
    },
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      provedor: "OPENROUTER",
      ativo: input.enabled,
      modelo: model,
      observacoes: input.notes?.trim() || null,
      chaveCriptografada: secretData.chaveCriptografada!,
      chaveFinal: secretData.chaveFinal!
    }
  });

  return toSummary(config);
}

async function getActiveOpenRouterSecret(scope: TenantScope) {
  // Gate do módulo de IA (liberado pelo dono do SaaS). Desligado → bloqueia toda a IA do cliente.
  const tenant = await prisma.tenant.findUnique({ where: { id: scope.tenantId }, select: { iaHabilitada: true } });
  if (tenant && !tenant.iaHabilitada) {
    throw new Error("Módulo de IA desabilitado para este cliente. Fale com o administrador da plataforma.");
  }

  const config = await prisma.configuracaoIa.findUnique({
    where: {
      tenantId_empresaId_provedor: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        provedor: "OPENROUTER"
      }
    }
  });

  if (!config || !config.ativo) {
    throw new Error("IA não configurada ou desativada para esta empresa.");
  }

  return {
    id: config.id,
    apiKey: decryptSecret(config.chaveCriptografada),
    model: config.modelo
  };
}

export async function callOpenRouter(scope: TenantScope, messages: ChatMessage[], options?: { maxTokens?: number; temperature?: number }) {
  const config = await getActiveOpenRouterSecret(scope);
  const response = await fetch(OPENROUTER_CHAT_URL, {
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens ?? 700
    }),
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "XERP"
    },
    method: "POST"
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof data?.error?.message === "string"
      ? data.error.message
      : `OpenRouter retornou HTTP ${response.status}.`;

    await prisma.configuracaoIa.update({
      where: { id: config.id },
      data: { ultimoErro: message }
    });

    throw new Error(message);
  }

  await prisma.configuracaoIa.update({
    where: { id: config.id },
    data: {
      testadoEm: new Date(),
      ultimoErro: null
    }
  });

  const content = data?.choices?.[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenRouter respondeu sem conteúdo utilizável.");
  }

  return content;
}

/**
 * Variante com VISÃO (multimodal): envia uma imagem + prompt e devolve o texto. Usado para ler
 * cupons fiscais (OCR). Monta `content` como array no padrão OpenAI/OpenRouter. Reusa a mesma
 * credencial/modelo de `callOpenRouter` (gpt-4o-mini tem visão). A imagem pode ser uma URL http
 * ou um data URL base64 (image_url aceita ambos).
 */
export async function callOpenRouterVision(
  scope: TenantScope,
  input: { prompt: string; systemPrompt?: string; imageUrl: string; maxTokens?: number; temperature?: number }
): Promise<string> {
  const config = await getActiveOpenRouterSecret(scope);
  const messages: Array<Record<string, unknown>> = [];
  if (input.systemPrompt) messages.push({ role: "system", content: input.systemPrompt });
  messages.push({
    role: "user",
    content: [
      { type: "text", text: input.prompt },
      { type: "image_url", image_url: { url: input.imageUrl } }
    ]
  });

  const response = await fetch(OPENROUTER_CHAT_URL, {
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: input.temperature ?? 0,
      max_tokens: input.maxTokens ?? 1200
    }),
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "XERP"
    },
    method: "POST"
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    let message = typeof data?.error?.message === "string" ? data.error.message : `OpenRouter retornou HTTP ${response.status}.`;
    if (/image|vision|multimodal|modality/i.test(message)) {
      message = `O modelo configurado (${config.model}) não suporta leitura de imagem. Use um modelo de visão (ex.: openai/gpt-4o-mini). Detalhe: ${message}`;
    }
    await prisma.configuracaoIa.update({ where: { id: config.id }, data: { ultimoErro: message } });
    throw new Error(message);
  }

  await prisma.configuracaoIa.update({ where: { id: config.id }, data: { testadoEm: new Date(), ultimoErro: null } });
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenRouter respondeu sem conteúdo utilizável.");
  }
  return content;
}

/**
 * Variante com function calling: envia `tools` e devolve a MENSAGEM completa do
 * assistant (incluindo `tool_calls`), para o runtime do agente conduzir o loop.
 * Reusa a mesma credencial/modelo criptografados de `callOpenRouter`.
 */
export async function callOpenRouterWithTools(
  scope: TenantScope,
  messages: ToolChatMessage[],
  tools: unknown[],
  options?: { maxTokens?: number; temperature?: number; toolChoice?: "auto" | "none" }
): Promise<AssistantToolMessage> {
  const config = await getActiveOpenRouterSecret(scope);
  const response = await fetch(OPENROUTER_CHAT_URL, {
    body: JSON.stringify({
      model: config.model,
      messages,
      tools,
      // "none" força resposta em TEXTO (fechamento do turno quando o loop de tools esgota).
      tool_choice: options?.toolChoice ?? "auto",
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens ?? 900
    }),
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "XERP"
    },
    method: "POST"
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof data?.error?.message === "string"
      ? data.error.message
      : `OpenRouter retornou HTTP ${response.status}.`;
    await prisma.configuracaoIa.update({ where: { id: config.id }, data: { ultimoErro: message } });
    throw new Error(message);
  }

  await prisma.configuracaoIa.update({
    where: { id: config.id },
    data: { testadoEm: new Date(), ultimoErro: null }
  });

  const message = data?.choices?.[0]?.message;
  if (!message || typeof message !== "object") {
    throw new Error("OpenRouter respondeu sem mensagem utilizável.");
  }
  return message as AssistantToolMessage;
}

export async function testOpenRouter(scope: TenantScope) {
  const content = await callOpenRouter(scope, [
    {
      role: "system",
      content: "Responda apenas em português do Brasil."
    },
    {
      role: "user",
      content: "Responda somente: IA configurada."
    }
  ], { maxTokens: 32, temperature: 0 });

  return { ok: true, message: content.trim() };
}

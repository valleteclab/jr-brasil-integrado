import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import type { AgentRole } from "../types";
import type { ToolChatMessage } from "@/domains/ai/openrouter-service";
import { createAuditLog } from "@/lib/audit/audit-service";

export type AgentChannel = "WEB" | "TELEGRAM" | "WHATSAPP";
export type SessionCommand = "FINALIZAR" | "NOVA";

const SESSION_WINDOW_MS = 4 * 60 * 60 * 1000;
const HISTORY_LIMIT = 20;
const MEMORY_LIMIT = 20;
const MAX_MEMORY_CHARS = 400;

function normalized(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
}

export function detectSessionCommand(input: string): SessionCommand | null {
  const value = normalized(input);
  if (["/finalizar", "finalizar", "finalizar conversa", "encerrar", "encerrar conversa", "fim da conversa"].includes(value)) {
    return "FINALIZAR";
  }
  if (["/nova", "/novo", "nova conversa", "novo assunto", "iniciar nova conversa", "comecar nova conversa"].includes(value)) {
    return "NOVA";
  }
  return null;
}

function hasSensitiveContent(input: string): boolean {
  return /\b(?:senha|password|token|secret|chave privada|private key|cvv|certificado|access[_ -]?token|refresh[_ -]?token)\b/i.test(input);
}

function safeSummaryText(input: string | undefined): string | null {
  if (!input) return null;
  if (hasSensitiveContent(input)) return "[conteúdo sensível omitido]";
  const clean = input
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/\b\d{32,}\b/g, "[código longo omitido]")
    .replace(/\s+/g, " ")
    .trim();
  return clean ? `${clean.slice(0, 280)}${clean.length > 280 ? "…" : ""}` : null;
}

async function buildSafeSummary(conversationId: string, scope: TenantScope): Promise<string> {
  const messages = await prisma.mensagemAgente.findMany({
    where: {
      conversaId: conversationId,
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      papel: { in: ["USER", "ASSISTANT"] }
    },
    orderBy: { criadoEm: "desc" },
    take: 12,
    select: { papel: true, conteudo: true }
  });

  const lastUser = messages.find((message) => message.papel === "USER");
  const lastAssistant = messages.find((message) => message.papel === "ASSISTANT");
  const parts = [`Sessão encerrada com resumo das ${messages.length} mensagens finais.`];
  const userText = safeSummaryText(lastUser?.conteudo);
  const assistantText = safeSummaryText(lastAssistant?.conteudo);
  if (userText) parts.push(`Última solicitação: ${userText}`);
  if (assistantText) parts.push(`Última resposta: ${assistantText}`);
  return parts.join("\n");
}

export async function closeConversation(
  scope: TenantScope,
  conversationId: string,
  reason: "USUARIO" | "NOVA_CONVERSA" | "INATIVIDADE",
  usuarioId?: string
): Promise<boolean> {
  const conversation = await prisma.conversaAgente.findFirst({
    where: {
      id: conversationId,
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      ...(usuarioId ? { usuarioId } : {}),
      status: "ATIVA"
    },
    select: { id: true }
  });
  if (!conversation) return false;

  const summary = await buildSafeSummary(conversation.id, scope);
  const closed = await prisma.$transaction(async (tx) => {
    const result = await tx.conversaAgente.updateMany({
      where: {
        id: conversation.id,
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        ...(usuarioId ? { usuarioId } : {}),
        status: "ATIVA"
      },
      data: {
        status: "ENCERRADA",
        encerradaEm: new Date(),
        motivoEncerramento: reason,
        resumo: summary
      }
    });
    if (result.count) {
      await createAuditLog(tx, {
        scope,
        entidade: "ConversaAgente",
        entidadeId: conversation.id,
        acao: "AGENT_CONVERSATION_CLOSE",
        payload: { reason }
      });
    }
    return result.count > 0;
  });
  return closed;
}

export async function closeActiveChannelConversation(input: {
  scope: TenantScope;
  channel: AgentChannel;
  channelKey: string;
  reason: "USUARIO" | "NOVA_CONVERSA";
}): Promise<boolean> {
  const conversation = await prisma.conversaAgente.findFirst({
    where: {
      tenantId: input.scope.tenantId,
      empresaId: input.scope.empresaId,
      canal: input.channel,
      telefone: input.channelKey,
      status: "ATIVA"
    },
    orderBy: { atualizadoEm: "desc" },
    select: { id: true }
  });
  return conversation ? closeConversation(input.scope, conversation.id, input.reason) : false;
}

export async function getOrCreateChannelConversation(input: {
  scope: TenantScope;
  channel: Exclude<AgentChannel, "WEB">;
  channelKey: string;
  role: AgentRole;
  title: string;
}) {
  const conversation = await prisma.conversaAgente.findFirst({
    where: {
      tenantId: input.scope.tenantId,
      empresaId: input.scope.empresaId,
      canal: input.channel,
      telefone: input.channelKey,
      status: "ATIVA"
    },
    orderBy: { atualizadoEm: "desc" }
  });

  if (conversation) {
    const expired = conversation.atualizadoEm.getTime() < Date.now() - SESSION_WINDOW_MS;
    if (!expired) return conversation;
    await closeConversation(input.scope, conversation.id, "INATIVIDADE");
  }

  return prisma.conversaAgente.create({
    data: {
      tenantId: input.scope.tenantId,
      empresaId: input.scope.empresaId,
      role: input.role,
      canal: input.channel,
      telefone: input.channelKey,
      titulo: input.title.slice(0, 60),
      status: "ATIVA"
    }
  });
}

export async function loadRecentConversationHistory(
  scope: TenantScope,
  conversationId: string
): Promise<ToolChatMessage[]> {
  const messages = await prisma.mensagemAgente.findMany({
    where: {
      conversaId: conversationId,
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      papel: { in: ["USER", "ASSISTANT"] }
    },
    orderBy: { criadoEm: "desc" },
    take: HISTORY_LIMIT,
    select: { papel: true, conteudo: true }
  });
  return messages.reverse().map((message) => ({
    role: message.papel === "USER" ? "user" : "assistant",
    content: message.conteudo
  }));
}

export async function loadAgentMemories(scope: TenantScope): Promise<string[]> {
  const memories = await prisma.memoriaAgente.findMany({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId, ativa: true },
    orderBy: { criadoEm: "desc" },
    take: MEMORY_LIMIT,
    select: { conteudo: true }
  });
  return memories.reverse().map((memory) => memory.conteudo);
}

type MemoryCommand =
  | { action: "SAVE"; content: string }
  | { action: "LIST" }
  | { action: "CLEAR" }
  | { action: "REMOVE"; index: number };

function detectMemoryCommand(input: string): MemoryCommand | null {
  const text = input.trim();
  const value = normalized(text);
  if (["/memorias", "listar memorias", "o que voce lembra", "quais memorias voce tem"].includes(value)) {
    return { action: "LIST" };
  }
  if (["/esquecer", "esquecer tudo", "esqueca tudo", "apagar memorias", "limpar memorias"].includes(value)) {
    return { action: "CLEAR" };
  }
  const remove = value.match(/^(?:\/esquecer|esquecer|esqueca)\s+(\d{1,2})$/);
  if (remove) return { action: "REMOVE", index: Number(remove[1]) };

  const save = text.match(/^(?:\/lembrar|lembre(?:-se)?|memorize)(?:\s+que)?\s+(.+)$/i);
  const content = save?.[1]?.trim();
  return content ? { action: "SAVE", content } : null;
}

export async function handleAgentMemoryCommand(input: {
  scope: TenantScope;
  role: AgentRole;
  channel: AgentChannel;
  channelKey?: string | null;
  text: string;
}): Promise<string | null> {
  const command = detectMemoryCommand(input.text);
  if (!command) return null;
  if (input.role !== "GESTOR") {
    return "Somente um gestor pode consultar ou alterar as memórias permanentes da empresa.";
  }

  if (command.action === "SAVE") {
    if (command.content.length > MAX_MEMORY_CHARS) {
      return `Essa memória ficou longa demais. Resuma em até ${MAX_MEMORY_CHARS} caracteres.`;
    }
    if (hasSensitiveContent(command.content)) {
      return "Não guardo senhas, tokens, certificados, chaves privadas ou outros segredos em memória.";
    }
    const existing = await prisma.memoriaAgente.findFirst({
      where: {
        tenantId: input.scope.tenantId,
        empresaId: input.scope.empresaId,
        ativa: true,
        conteudo: { equals: command.content, mode: "insensitive" }
      },
      select: { id: true }
    });
    if (existing) return "Essa informação já está na memória da empresa.";

    await prisma.$transaction(async (tx) => {
      const memory = await tx.memoriaAgente.create({
        data: {
          tenantId: input.scope.tenantId,
          empresaId: input.scope.empresaId,
          conteudo: command.content,
          criadoPorRole: input.role,
          origemCanal: input.channel,
          origemChave: input.channelKey || null
        }
      });
      await createAuditLog(tx, {
        scope: input.scope,
        entidade: "MemoriaAgente",
        entidadeId: memory.id,
        acao: "AGENT_MEMORY_CREATE",
        payload: { channel: input.channel }
      });
    });
    return `Memória salva para esta empresa: “${command.content}”`;
  }

  const memories = await prisma.memoriaAgente.findMany({
    where: { tenantId: input.scope.tenantId, empresaId: input.scope.empresaId, ativa: true },
    orderBy: { criadoEm: "asc" },
    take: MEMORY_LIMIT,
    select: { id: true, conteudo: true }
  });

  if (command.action === "LIST") {
    if (!memories.length) return "Ainda não existem memórias permanentes para esta empresa.";
    return `Memórias da empresa:\n${memories.map((memory, index) => `${index + 1}. ${memory.conteudo}`).join("\n")}`;
  }

  if (command.action === "CLEAR") {
    if (!memories.length) return "Não há memórias permanentes para apagar.";
    await prisma.$transaction(async (tx) => {
      await tx.memoriaAgente.updateMany({
        where: { id: { in: memories.map((memory) => memory.id) }, tenantId: input.scope.tenantId, empresaId: input.scope.empresaId },
        data: { ativa: false, removidaEm: new Date() }
      });
      await createAuditLog(tx, {
        scope: input.scope,
        entidade: "MemoriaAgente",
        entidadeId: input.scope.empresaId,
        acao: "AGENT_MEMORY_CLEAR",
        payload: { count: memories.length, channel: input.channel }
      });
    });
    return `${memories.length} memória(s) removida(s). O histórico de auditoria foi preservado.`;
  }

  const selected = memories[command.index - 1];
  if (!selected) return `Memória ${command.index} não encontrada. Use “listar memórias” para conferir a numeração.`;
  await prisma.$transaction(async (tx) => {
    await tx.memoriaAgente.updateMany({
      where: { id: selected.id, tenantId: input.scope.tenantId, empresaId: input.scope.empresaId, ativa: true },
      data: { ativa: false, removidaEm: new Date() }
    });
    await createAuditLog(tx, {
      scope: input.scope,
      entidade: "MemoriaAgente",
      entidadeId: selected.id,
      acao: "AGENT_MEMORY_REMOVE",
      payload: { channel: input.channel }
    });
  });
  return `Memória ${command.index} removida.`;
}

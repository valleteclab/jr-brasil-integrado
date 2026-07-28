import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { extractQuickActions, runAgentTurn } from "@/domains/agent/runtime/run-agent-turn";
import type { AgentRole } from "@/domains/agent/types";
import { getAiVoice } from "@/domains/ai/openrouter-service";
import { synthesizeKokoroSpeech } from "@/lib/tts/kokoro-client";
import { responseNeedsText } from "@/domains/agent/runtime/voice-response-policy";
import {
  closeConversation,
  detectSessionCommand,
  handleAgentMemoryCommand,
  loadRecentConversationHistory
} from "@/domains/agent/runtime/conversation-session";
import {
  prepareWebChatAttachment,
  WebChatAttachmentError
} from "@/domains/agent/runtime/web-chat-attachment";

const ROLES: AgentRole[] = ["GESTOR", "VENDEDOR"];
export const runtime = "nodejs";

// Lista as conversas WEB do usuário e carrega as mensagens da conversa selecionada.
export async function GET(request: Request) {
  try {
    const session = await requireModulo("assistente");
    const scope = await getDevelopmentTenantScope();
    const requestedConversationId = new URL(request.url).searchParams.get("conversaId");
    const conversations = await prisma.conversaAgente.findMany({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        usuarioId: session.usuarioId,
        canal: "WEB"
      },
      orderBy: { atualizadoEm: "desc" },
      take: 30,
      select: {
        id: true,
        titulo: true,
        role: true,
        status: true,
        criadoEm: true,
        atualizadoEm: true,
        mensagens: {
          where: { papel: { in: ["USER", "ASSISTANT"] } },
          orderBy: { criadoEm: "desc" },
          take: 1,
          select: { conteudo: true }
        }
      }
    });

    const selected =
      conversations.find((conversation) => conversation.id === requestedConversationId) ??
      conversations.find((conversation) => conversation.status === "ATIVA") ??
      conversations[0] ??
      null;

    const storedMessages = selected
      ? await prisma.mensagemAgente.findMany({
          where: {
            conversaId: selected.id,
            tenantId: scope.tenantId,
            empresaId: scope.empresaId,
            papel: { in: ["USER", "ASSISTANT"] }
          },
          orderBy: { criadoEm: "desc" },
          take: 100,
          select: { id: true, papel: true, conteudo: true, criadoEm: true }
        })
      : [];
    const orderedMessages = storedMessages.reverse();

    return NextResponse.json({
      conversations: conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.titulo || "Conversa sem título",
        role: conversation.role,
        status: conversation.status,
        createdAt: conversation.criadoEm,
        updatedAt: conversation.atualizadoEm,
        preview: conversation.mensagens[0]?.conteudo.slice(0, 100) ?? ""
      })),
      selectedConversation: selected
        ? {
            id: selected.id,
            title: selected.titulo || "Conversa sem título",
            role: selected.role,
            status: selected.status
          }
        : null,
      messages: orderedMessages.map((message, index) => {
        const isLastActiveAssistant =
          selected?.status === "ATIVA" &&
          message.papel === "ASSISTANT" &&
          index === orderedMessages.length - 1;
        const parsed = isLastActiveAssistant
          ? extractQuickActions(message.conteudo)
          : { text: message.conteudo, actions: [] };
        return {
          id: message.id,
          papel: message.papel === "USER" ? "user" : "assistant",
          texto: parsed.text,
          quickActions: parsed.actions,
          createdAt: message.criadoEm
        };
      })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar as conversas.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 500) });
  }
}

// Um turno do chat do assistente: cria/continua conversa, roda o agente e persiste.
export async function POST(request: Request) {
  try {
    const session = await requireModulo("assistente");
    const scope = await getDevelopmentTenantScope();
    let body: {
      conversaId?: string;
      role?: string;
      mensagem?: string;
      acao?: "finalizar";
    };
    let attachmentLabel: string | null = null;
    let inputByVoice = false;

    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      body = {
        conversaId: String(form.get("conversaId") ?? "") || undefined,
        role: String(form.get("role") ?? "") || undefined,
        mensagem: String(form.get("mensagem") ?? "") || undefined
      };
      const attachment = form.get("anexo");
      if (!(attachment instanceof File)) {
        throw new WebChatAttachmentError("Selecione um arquivo ou grave um áudio.");
      }
      const prepared = await prepareWebChatAttachment(scope, {
        file: attachment,
        message: body.mensagem
      });
      body.mensagem = prepared.agentMessage;
      attachmentLabel = prepared.attachmentLabel;
      inputByVoice = prepared.attachmentKind === "audio";
    } else {
      body = (await request.json()) as typeof body;
    }

    if (body.acao === "finalizar") {
      const closed = body.conversaId
        ? await closeConversation(scope, body.conversaId, "USUARIO", session.usuarioId)
        : false;
      return NextResponse.json({
        conversationEnded: true,
        assistantText: closed
          ? "Conversa encerrada. A próxima mensagem iniciará uma nova sessão."
          : "Não havia uma conversa ativa."
      });
    }

    const mensagem = (body.mensagem ?? "").trim();
    if (!mensagem) return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });

    const role: AgentRole = ROLES.includes(body.role as AgentRole) ? (body.role as AgentRole) : "GESTOR";

    const sessionCommand = detectSessionCommand(mensagem);
    if (sessionCommand) {
      const closed = body.conversaId
        ? await closeConversation(
            scope,
            body.conversaId,
            sessionCommand === "NOVA" ? "NOVA_CONVERSA" : "USUARIO",
            session.usuarioId
          )
        : false;
      return NextResponse.json({
        conversationEnded: true,
        assistantText: closed
          ? sessionCommand === "NOVA"
            ? "Conversa anterior encerrada. Escreva a próxima mensagem para começar um novo assunto."
            : "Conversa encerrada. Quando quiser voltar, é só iniciar uma nova conversa."
          : "Não havia uma conversa ativa."
      });
    }

    const memoryResponse = await handleAgentMemoryCommand({
      scope,
      role,
      channel: "WEB",
      channelKey: session.usuarioId,
      text: mensagem
    });
    if (memoryResponse) {
      return NextResponse.json({ conversaId: body.conversaId ?? null, assistantText: memoryResponse, draft: null });
    }

    const empresa = await prisma.empresa.findFirst({
      where: { id: scope.empresaId, tenantId: scope.tenantId },
      select: { nomeFantasia: true, razaoSocial: true }
    });
    const empresaNome = empresa?.nomeFantasia ?? empresa?.razaoSocial ?? "sua empresa";

    // Carrega ou cria a conversa (escopada por tenant+empresa).
    let conversa = body.conversaId
      ? await prisma.conversaAgente.findFirst({
          where: {
            id: body.conversaId,
            tenantId: scope.tenantId,
            empresaId: scope.empresaId,
            usuarioId: session.usuarioId,
            status: "ATIVA"
          }
        })
      : null;
    if (!conversa) {
      const anterioresAtivas = await prisma.conversaAgente.findMany({
        where: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          usuarioId: session.usuarioId,
          canal: "WEB",
          status: "ATIVA"
        },
        select: { id: true },
        take: 10
      });
      for (const anterior of anterioresAtivas) {
        await closeConversation(scope, anterior.id, "NOVA_CONVERSA", session.usuarioId);
      }
      conversa = await prisma.conversaAgente.create({
        data: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          usuarioId: session.usuarioId,
          role,
          titulo: mensagem.slice(0, 60),
          status: "ATIVA"
        }
      });
    }

    const historico = await loadRecentConversationHistory(scope, conversa.id);

    // Persiste a mensagem do usuário.
    await prisma.mensagemAgente.create({
      data: { tenantId: scope.tenantId, empresaId: scope.empresaId, conversaId: conversa.id, papel: "USER", conteudo: mensagem }
    });

    // URL pública (via proxy) para o agente montar links absolutos de PDF/documentos.
    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host")?.trim() || "";
    const result = await runAgentTurn({
      scope,
      role,
      empresaNome,
      historico,
      mensagemUsuario: mensagem,
      conversaId: conversa.id,
      baseUrl: host ? `${proto}://${host}` : null
    });

    // Persiste as mensagens geradas (tools + resposta final).
    for (const m of result.novasMensagens) {
      await prisma.mensagemAgente.create({
        data: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          conversaId: conversa.id,
          papel: m.papel,
          conteudo: m.conteudo,
          toolName: m.toolName ?? null,
          toolPayload: m.toolPayload === undefined ? undefined : (m.toolPayload as object),
          draftTipo: m.draftTipo ?? null,
          draftId: m.draftId ?? null
        }
      });
    }
    await prisma.conversaAgente.update({ where: { id: conversa.id }, data: { atualizadoEm: new Date() } });

    // Mesmo comportamento dos canais móveis: voz recebida gera resposta em voz. Se houver
    // valores, links, código ou operação criada, o texto também permanece visível.
    let assistantAudioBase64: string | null = null;
    let showAssistantText = true;
    if (inputByVoice) {
      try {
        const voice = await getAiVoice(scope);
        const audio = await synthesizeKokoroSpeech(
          result.assistantText,
          voice,
          { responseFormat: "wav" }
        );
        if (audio) {
          assistantAudioBase64 = audio.toString("base64");
          showAssistantText = responseNeedsText(result, result.assistantText);
        }
      } catch (voiceError) {
        // Falha do TTS nunca apaga a resposta textual já produzida pelo agente.
        console.warn(
          "[assistente-web-voz]",
          voiceError instanceof Error ? voiceError.message : voiceError
        );
      }
    }

    return NextResponse.json({
      conversaId: conversa.id,
      assistantText: result.assistantText,
      assistantAudioBase64,
      assistantAudioMime: assistantAudioBase64 ? "audio/wav" : null,
      showAssistantText,
      draft: result.draft,
      quickActions: result.quickActions,
      attachmentLabel
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao processar a mensagem.";
    const isConfig = message.includes("IA não configurada") || message.includes("desativada");
    const isAttachment = error instanceof WebChatAttachmentError;
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, isConfig || isAttachment ? 400 : 500) });
  }
}

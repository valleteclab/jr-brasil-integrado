import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { runAgentTurn } from "@/domains/agent/runtime/run-agent-turn";
import type { AgentRole } from "@/domains/agent/types";
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

    return NextResponse.json({
      conversaId: conversa.id,
      assistantText: result.assistantText,
      draft: result.draft,
      attachmentLabel
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao processar a mensagem.";
    const isConfig = message.includes("IA não configurada") || message.includes("desativada");
    const isAttachment = error instanceof WebChatAttachmentError;
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, isConfig || isAttachment ? 400 : 500) });
  }
}

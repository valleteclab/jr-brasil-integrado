import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { callOpenRouterWithTools, type ToolChatMessage } from "@/domains/ai/openrouter-service";
import type { AgentDraft, AgentRole } from "../types";
import { getTool, getToolsForRole, toOpenAiTools } from "../tools/registry";
import { buildSystemPrompt } from "./system-prompt";

const MAX_ITERACOES = 5;

export type AgentTurnResult = {
  assistantText: string;
  draft: AgentDraft | null;
  /** Mensagens novas a persistir (tool calls + resposta final), na ordem. */
  novasMensagens: Array<{
    papel: "ASSISTANT" | "TOOL";
    conteudo: string;
    toolName?: string;
    toolPayload?: unknown;
    draftTipo?: string;
    draftId?: string;
  }>;
};

/**
 * Executa um turno do agente: monta o contexto, roda o loop de tool-calling
 * (limitado a MAX_ITERACOES) e devolve o texto final + eventual rascunho criado.
 * As ferramentas são filtradas pelo papel (gestor/vendedor). Toda escrita já é
 * auditada dentro do use-case; aqui registramos uma auditoria AGENT_CREATE_DRAFT.
 */
export async function runAgentTurn(params: {
  scope: TenantScope;
  role: AgentRole;
  empresaNome: string;
  historico: ToolChatMessage[];
  mensagemUsuario: string;
  conversaId: string;
}): Promise<AgentTurnResult> {
  const { scope, role, empresaNome, historico, mensagemUsuario, conversaId } = params;

  const tools = getToolsForRole(role);
  const openAiTools = toOpenAiTools(tools);

  const messages: ToolChatMessage[] = [
    { role: "system", content: buildSystemPrompt(role, empresaNome) },
    ...historico,
    { role: "user", content: mensagemUsuario }
  ];

  const novasMensagens: AgentTurnResult["novasMensagens"] = [];
  let draft: AgentDraft | null = null;

  for (let i = 0; i < MAX_ITERACOES; i++) {
    const assistant = await callOpenRouterWithTools(scope, messages, openAiTools);
    const toolCalls = assistant.tool_calls ?? [];

    // Sem tool calls → resposta final em texto.
    if (toolCalls.length === 0) {
      const texto = (assistant.content ?? "").trim() || "Não consegui gerar uma resposta.";
      novasMensagens.push({ papel: "ASSISTANT", conteudo: texto });
      return { assistantText: texto, draft, novasMensagens };
    }

    // Anexa a mensagem do assistant com os tool_calls (exigência do protocolo).
    messages.push({ role: "assistant", content: assistant.content ?? null, tool_calls: toolCalls });

    for (const call of toolCalls) {
      const tool = getTool(call.function.name);
      let resultPayload: unknown;

      if (!tool || !tool.roles.includes(role)) {
        resultPayload = { ok: false, error: "Ferramenta indisponível para o seu perfil." };
      } else {
        let args: Record<string, unknown> = {};
        try {
          args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          args = {};
        }
        try {
          const result = await tool.handler(scope, args);
          resultPayload = result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error };
          if (result.ok && result.draft) {
            draft = result.draft;
            // Auditoria da criação de rascunho pelo agente.
            await prisma.$transaction(async (tx) => {
              await createAuditLog(tx, {
                scope,
                entidade: result.draft!.tipo,
                entidadeId: result.draft!.id,
                acao: "AGENT_CREATE_DRAFT",
                payload: { tool: tool.name, conversaId, numero: result.draft!.numero ?? null }
              });
            });
          }
        } catch (err) {
          resultPayload = { ok: false, error: err instanceof Error ? err.message : "Falha ao executar a ferramenta." };
        }
      }

      const conteudo = JSON.stringify(resultPayload);
      messages.push({ role: "tool", tool_call_id: call.id, content: conteudo });
      novasMensagens.push({
        papel: "TOOL",
        conteudo,
        toolName: call.function.name,
        toolPayload: resultPayload,
        draftTipo: draft?.tipo,
        draftId: draft?.id
      });
    }
  }

  // Estourou o limite de iterações sem resposta final.
  const aviso = "Não consegui concluir a solicitação em tempo. Tente reformular ou peça um passo de cada vez.";
  novasMensagens.push({ papel: "ASSISTANT", conteudo: aviso });
  return { assistantText: aviso, draft, novasMensagens };
}

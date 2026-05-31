import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { runAgentTurn } from "@/domains/agent/runtime/run-agent-turn";
import type { AgentRole } from "@/domains/agent/types";
import type { ToolChatMessage } from "@/domains/ai/openrouter-service";

const ROLES: AgentRole[] = ["GESTOR", "VENDEDOR"];

// Um turno do chat do assistente: cria/continua conversa, roda o agente e persiste.
export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as { conversaId?: string; role?: string; mensagem?: string };

    const mensagem = (body.mensagem ?? "").trim();
    if (!mensagem) return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });

    const role: AgentRole = ROLES.includes(body.role as AgentRole) ? (body.role as AgentRole) : "GESTOR";

    const empresa = await prisma.empresa.findFirst({
      where: { id: scope.empresaId, tenantId: scope.tenantId },
      select: { nomeFantasia: true, razaoSocial: true }
    });
    const empresaNome = empresa?.nomeFantasia ?? empresa?.razaoSocial ?? "sua empresa";

    // Carrega ou cria a conversa (escopada por tenant+empresa).
    let conversa = body.conversaId
      ? await prisma.conversaAgente.findFirst({
          where: { id: body.conversaId, tenantId: scope.tenantId, empresaId: scope.empresaId }
        })
      : null;
    if (!conversa) {
      conversa = await prisma.conversaAgente.create({
        data: { tenantId: scope.tenantId, empresaId: scope.empresaId, role, titulo: mensagem.slice(0, 60) }
      });
    }

    // Histórico (USER/ASSISTANT) para dar contexto ao modelo — tools não são reenviadas.
    const anteriores = await prisma.mensagemAgente.findMany({
      where: { conversaId: conversa.id, tenantId: scope.tenantId, empresaId: scope.empresaId, papel: { in: ["USER", "ASSISTANT"] } },
      orderBy: { criadoEm: "asc" },
      take: 20,
      select: { papel: true, conteudo: true }
    });
    const historico: ToolChatMessage[] = anteriores.map((m) => ({
      role: m.papel === "USER" ? "user" : "assistant",
      content: m.conteudo
    }));

    // Persiste a mensagem do usuário.
    await prisma.mensagemAgente.create({
      data: { tenantId: scope.tenantId, empresaId: scope.empresaId, conversaId: conversa.id, papel: "USER", conteudo: mensagem }
    });

    const result = await runAgentTurn({
      scope,
      role,
      empresaNome,
      historico,
      mensagemUsuario: mensagem,
      conversaId: conversa.id
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
      draft: result.draft
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao processar a mensagem.";
    const isConfig = message.includes("IA não configurada") || message.includes("desativada");
    return NextResponse.json({ error: message }, { status: isConfig ? 400 : 500 });
  }
}

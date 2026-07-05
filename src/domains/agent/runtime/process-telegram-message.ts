import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import type { AgentRole } from "../types";
import { runAgentTurn } from "./run-agent-turn";
import type { ToolChatMessage } from "@/domains/ai/openrouter-service";
import {
  sendTelegramPedirContato,
  sendTelegramText,
  sendTelegramTextoSemTeclado,
  type TelegramRuntime
} from "@/lib/telegram/telegram-service";

/**
 * Processa um update do Telegram (mesmo agente do WhatsApp, canal TELEGRAM):
 *
 * 1. Identidade pelo chat: TelegramVinculo (criado quando o usuário COMPARTILHA O CONTATO —
 *    o Telegram verifica que o contato é do próprio usuário). O telefone é casado com
 *    AgenteTelefone (papel GESTOR/VENDEDOR) ou, se a empresa atende clientes, com
 *    ClienteContato.whatsapp (papel CLIENTE escopado ao cliente).
 * 2. Sem vínculo → pede o contato com o botão nativo. Contato de outra pessoa → recusa.
 * 3. Com vínculo → roda o agente (mesmas tools: pedidos, OS, boleto, Pix, NF-e, NFS-e...).
 *
 * Nunca lança: erros são absorvidos (o webhook responde 200 sempre).
 */

type TelegramContact = { phone_number?: string; user_id?: number };
type TelegramMessage = {
  message_id?: number;
  from?: { id?: number; first_name?: string; last_name?: string; username?: string };
  chat?: { id?: number; type?: string };
  text?: string;
  contact?: TelegramContact;
};

export async function processTelegramMessage(
  runtime: TelegramRuntime & { tenantId: string; empresaId: string },
  message: TelegramMessage,
  baseUrl?: string | null
): Promise<void> {
  const chatType = message.chat?.type ?? "";
  const chatId = message.chat?.id != null ? String(message.chat.id) : "";
  if (!chatId || chatType !== "private") return; // v1: só conversa privada

  const scope: TenantScope = { tenantId: runtime.tenantId, empresaId: runtime.empresaId };
  const nomeRemetente = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ") || message.from?.username || null;

  const vinculo = await prisma.telegramVinculo.findUnique({
    where: { empresaId_chatId: { empresaId: scope.empresaId, chatId } }
  });

  // ── Sem vínculo: fluxo de identificação ──────────────────────────────────
  if (!vinculo || !vinculo.ativo) {
    const contato = message.contact;
    if (contato?.phone_number) {
      // Segurança: só aceita o contato do PRÓPRIO usuário (verificado pelo Telegram).
      if (contato.user_id !== message.from?.id) {
        await sendTelegramText(runtime, chatId, "Por segurança, compartilhe o seu próprio contato (use o botão abaixo).");
        return;
      }
      const telefone = contato.phone_number.replace(/\D/g, "");
      const identidade = await resolverIdentidade(scope, telefone, runtime.atenderClientes);
      if (!identidade) {
        await sendTelegramTextoSemTeclado(
          runtime,
          chatId,
          "Seu número não está autorizado nesta empresa. Peça ao gestor para cadastrá-lo em Configurações → IA do ERP → Telefones do agente."
        );
        return;
      }
      await prisma.telegramVinculo.upsert({
        where: { empresaId_chatId: { empresaId: scope.empresaId, chatId } },
        update: { telefone, nome: nomeRemetente, role: identidade.role, clienteId: identidade.clienteId, ativo: true },
        create: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          chatId,
          telefone,
          nome: nomeRemetente,
          role: identidade.role,
          clienteId: identidade.clienteId
        }
      });
      const saudacao = identidade.role === "CLIENTE"
        ? "✅ Número confirmado! Sou o assistente da empresa — posso consultar seus pedidos, boletos e o andamento das suas OS. Como posso ajudar?"
        : `✅ Número confirmado (${identidade.role.toLowerCase()})! Posso consultar estoque, pedidos e OS, criar orçamentos/pré-vendas, emitir boleto/Pix e notas. Como posso ajudar?`;
      await sendTelegramTextoSemTeclado(runtime, chatId, saudacao);
      return;
    }
    // Qualquer outra mensagem sem vínculo → pede o contato.
    await sendTelegramPedirContato(
      runtime,
      chatId,
      "Olá! Para eu saber quem você é, toque no botão abaixo e compartilhe seu número (o mesmo cadastrado na empresa)."
    );
    return;
  }

  // ── Com vínculo: roda o agente ───────────────────────────────────────────
  const texto = (message.text ?? "").trim();
  if (!texto) return;

  const role = vinculo.role as AgentRole;
  const clienteId = vinculo.clienteId ?? null;

  // Ambiente fiscal vigente — isola homologação de produção nas consultas.
  const cfgFiscal = await prisma.configuracaoFiscal.findUnique({
    where: { empresaId: scope.empresaId },
    select: { ambiente: true }
  });
  scope.ambiente = cfgFiscal?.ambiente ?? "HOMOLOGACAO";

  const empresa = await prisma.empresa.findFirst({
    where: { id: scope.empresaId, tenantId: scope.tenantId },
    select: { nomeFantasia: true, razaoSocial: true }
  });
  const empresaNome = empresa?.nomeFantasia ?? empresa?.razaoSocial ?? "sua empresa";

  // Conversa por chat (canal TELEGRAM; o campo telefone guarda o chatId — chave estável do canal).
  // JANELA DE SESSÃO: conversa parada há mais de 4h vira conversa NOVA — o histórico de vendas
  // antigas contamina o contexto (o modelo ressuscita quantidades/confirmações passadas).
  const janelaSessao = new Date(Date.now() - 4 * 60 * 60 * 1000);
  let conversa = await prisma.conversaAgente.findFirst({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId, canal: "TELEGRAM", telefone: chatId, atualizadoEm: { gte: janelaSessao } },
    orderBy: { atualizadoEm: "desc" }
  });
  if (!conversa) {
    conversa = await prisma.conversaAgente.create({
      data: { tenantId: scope.tenantId, empresaId: scope.empresaId, role, canal: "TELEGRAM", telefone: chatId, titulo: texto.slice(0, 60) }
    });
  }

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

  await prisma.mensagemAgente.create({
    data: { tenantId: scope.tenantId, empresaId: scope.empresaId, conversaId: conversa.id, papel: "USER", conteudo: texto }
  });

  // Erro no turno (ex.: IA não configurada na empresa) → responde o motivo em vez de silêncio.
  let result: Awaited<ReturnType<typeof runAgentTurn>>;
  try {
    result = await runAgentTurn({ scope, role, empresaNome, historico, mensagemUsuario: texto, conversaId: conversa.id, clienteId, baseUrl });
  } catch (err) {
    const motivo = err instanceof Error ? err.message : "erro inesperado";
    console.error("[telegram] runAgentTurn falhou:", motivo);
    await sendTelegramText(
      runtime,
      chatId,
      `⚠️ Não consegui processar agora: ${motivo}\n\nSe for configuração, peça ao administrador para revisar em Configurações → IA do ERP.`
    );
    return;
  }

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

  let resposta = result.assistantText;
  if (result.draft) {
    const tipoLabel = result.draft.tipo === "ORCAMENTO" ? "Orçamento" : result.draft.tipo === "PEDIDO_VENDA" ? "Pré-venda" : "Cadastro";
    // GESTOR fecha o ciclo pelo próprio chat (confirmar/faturar); os demais dependem de um responsável.
    resposta += role === "GESTOR"
      ? `\n\n📝 ${tipoLabel} ${result.draft.numero ?? ""} criado(a).`
      : `\n\n📝 ${tipoLabel} ${result.draft.numero ?? ""} criado(a) como rascunho. Um responsável vai confirmar no sistema.`;
  }
  await sendTelegramText(runtime, chatId, resposta);
}

/** Casa o telefone com AgenteTelefone (papel dele) ou ClienteContato (CLIENTE). */
async function resolverIdentidade(
  scope: TenantScope,
  telefone: string,
  atenderClientes: boolean
): Promise<{ role: AgentRole; clienteId: string | null } | null> {
  // Compara pelos últimos 8 dígitos (o Telegram manda +55DDD..., o cadastro pode variar).
  const sufixo = telefone.slice(-8);
  const autorizado = await prisma.agenteTelefone.findFirst({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId, ativo: true, telefone: { contains: sufixo } }
  });
  if (autorizado) return { role: autorizado.role as AgentRole, clienteId: autorizado.clienteId ?? null };

  if (!atenderClientes) return null;
  const contato = await prisma.clienteContato.findFirst({
    where: { whatsapp: { contains: sufixo }, cliente: { tenantId: scope.tenantId, empresaId: scope.empresaId } },
    select: { clienteId: true }
  });
  if (contato) return { role: "CLIENTE", clienteId: contato.clienteId };
  return null;
}

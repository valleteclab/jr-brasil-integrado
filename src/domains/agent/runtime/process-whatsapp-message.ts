import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import type { AgentRole } from "../types";
import { runAgentTurn } from "./run-agent-turn";
import { getWhatsappRuntime, sendWhatsappText } from "@/lib/whatsapp/whatsapp-service";
import { resolverEmpresaAtiva } from "./selecao-empresa";
import {
  closeActiveChannelConversation,
  detectSessionCommand,
  getOrCreateChannelConversation,
  handleAgentMemoryCommand,
  loadRecentConversationHistory
} from "./conversation-session";

/**
 * Processa uma mensagem recebida do WhatsApp (Z-API):
 * 1. Resolve a identidade pelo telefone (AgenteTelefone → tenant/empresa/papel/cliente).
 *    Telefone não autorizado: se a empresa atende clientes e o telefone bate com um
 *    ClienteContato.whatsapp, vira papel CLIENTE escopado ao próprio cliente; senão, ignora.
 * 2. Roda o agente (mesmas tools da web; rascunhos permitidos p/ vendedor/gestor).
 * 3. Persiste a conversa e responde via Z-API.
 *
 * Nunca lança: erros são logados e absorvidos (webhook responde 200 sempre).
 */
export async function processWhatsappMessage(input: { telefone: string; texto: string; baseUrl?: string | null }): Promise<void> {
  const telefone = input.telefone.replace(/\D/g, "");
  const texto = input.texto.trim();
  if (!telefone || !texto) return;

  // 1) Identidade autorizada (vendedor/gestor) por telefone — com SELEÇÃO DE EMPRESA quando o
  // telefone opera várias (contador multi-CNPJ): o seletor fixa a empresa ativa da sessão.
  const resolucao = await resolverEmpresaAtiva({ canal: "WHATSAPP", chave: telefone, telefone, texto });

  let scope: TenantScope;
  let role: AgentRole;
  let clienteId: string | null = null;
  let multiEmpresa = false;
  let empresaAtivaNome = "";

  if (resolucao.tipo === "responder") {
    // Seletor/troca de empresa: responde e não processa o texto como pergunta.
    const vinculoQualquer = await prisma.agenteTelefone.findFirst({ where: { telefone, ativo: true }, select: { tenantId: true, empresaId: true } });
    if (vinculoQualquer) {
      const whatsSel = await getWhatsappRuntime({ tenantId: vinculoQualquer.tenantId, empresaId: vinculoQualquer.empresaId });
      if (whatsSel?.ativo) await sendWhatsappText(whatsSel, telefone, resolucao.mensagem);
    }
    return;
  }

  if (resolucao.tipo === "ok") {
    scope = { tenantId: resolucao.vinculo.tenantId, empresaId: resolucao.vinculo.empresaId };
    role = resolucao.vinculo.role;
    clienteId = resolucao.vinculo.clienteId;
    multiEmpresa = resolucao.multi;
    empresaAtivaNome = resolucao.vinculo.empresaNome;
  } else {
    // 2) Cliente final: localizar por ClienteContato.whatsapp em empresas que atendem clientes.
    const contato = await prisma.clienteContato.findFirst({
      where: { whatsapp: { contains: telefone.slice(-8) } },
      select: { clienteId: true, cliente: { select: { tenantId: true, empresaId: true } } }
    });
    if (!contato?.cliente) return; // telefone desconhecido → ignora silenciosamente
    const cfg = await prisma.configuracaoWhatsapp.findUnique({
      where: { empresaId: contato.cliente.empresaId },
      select: { ativo: true, atenderClientes: true }
    });
    if (!cfg?.ativo || !cfg.atenderClientes) return;
    scope = { tenantId: contato.cliente.tenantId, empresaId: contato.cliente.empresaId };
    role = "CLIENTE";
    clienteId = contato.clienteId;
  }

  // Ambiente fiscal vigente da empresa — isola dados de homologação (teste) dos de produção
  // nas consultas do agente (ex.: pedidos do cliente). Sem isso, o scope manual não traria ambiente.
  const cfgFiscalAmbiente = await prisma.configuracaoFiscal.findUnique({
    where: { empresaId: scope.empresaId },
    select: { ambiente: true }
  });
  scope.ambiente = cfgFiscalAmbiente?.ambiente ?? "HOMOLOGACAO";

  // WhatsApp precisa estar ativo na empresa para responder.
  const whats = await getWhatsappRuntime(scope);
  if (!whats?.ativo) return;

  const sessionCommand = detectSessionCommand(texto);
  if (sessionCommand) {
    const closed = await closeActiveChannelConversation({
      scope,
      channel: "WHATSAPP",
      channelKey: telefone,
      reason: sessionCommand === "NOVA" ? "NOVA_CONVERSA" : "USUARIO"
    });
    await sendWhatsappText(
      whats,
      telefone,
      closed
        ? sessionCommand === "NOVA"
          ? "Conversa anterior encerrada. Envie a próxima mensagem para começar um novo assunto."
          : "Conversa encerrada. Quando quiser voltar, é só enviar uma nova mensagem."
        : "Não havia uma conversa ativa. Envie uma mensagem quando quiser começar."
    );
    return;
  }

  const memoryResponse = await handleAgentMemoryCommand({
    scope,
    role,
    channel: "WHATSAPP",
    channelKey: telefone,
    text: texto
  });
  if (memoryResponse) {
    await sendWhatsappText(whats, telefone, memoryResponse);
    return;
  }

  const empresa = await prisma.empresa.findFirst({
    where: { id: scope.empresaId, tenantId: scope.tenantId },
    select: { nomeFantasia: true, razaoSocial: true }
  });
  const empresaNome = empresa?.nomeFantasia ?? empresa?.razaoSocial ?? "sua empresa";

  const conversa = await getOrCreateChannelConversation({
    scope,
    channel: "WHATSAPP",
    channelKey: telefone,
    role,
    title: texto
  });
  const historico = await loadRecentConversationHistory(scope, conversa.id);

  await prisma.mensagemAgente.create({
    data: { tenantId: scope.tenantId, empresaId: scope.empresaId, conversaId: conversa.id, papel: "USER", conteudo: texto }
  });

  const result = await runAgentTurn({ scope, role, empresaNome, historico, mensagemUsuario: texto, conversaId: conversa.id, clienteId, baseUrl: input.baseUrl ?? null });

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

  // Monta a resposta (texto + aviso de rascunho, quando houver).
  let resposta = result.assistantText;
  if (result.draft) {
    const tipoLabel = result.draft.tipo === "ORCAMENTO" ? "Orçamento" : result.draft.tipo === "PEDIDO_VENDA" ? "Pré-venda" : "Cadastro";
    // GESTOR fecha o ciclo pelo próprio chat (confirmar/faturar); os demais dependem de um responsável.
    resposta += role === "GESTOR"
      ? `\n\n📝 ${tipoLabel} ${result.draft.numero ?? ""} criado(a).`
      : `\n\n📝 ${tipoLabel} ${result.draft.numero ?? ""} criado(a) como rascunho. Um responsável vai confirmar no sistema.`;
  }
  // Multi-empresa: deixa SEMPRE claro por qual empresa a ação valeu (segurança do contador).
  if (multiEmpresa && empresaAtivaNome) {
    resposta = `🏢 *${empresaAtivaNome}*\n\n${resposta}`;
  }
  await sendWhatsappText(whats, telefone, resposta);
}

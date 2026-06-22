import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import type { AgentRole } from "../types";
import { runAgentTurn } from "./run-agent-turn";
import type { ToolChatMessage } from "@/domains/ai/openrouter-service";
import { getWhatsappRuntime, sendWhatsappText } from "@/lib/whatsapp/zapi-client";

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
export async function processWhatsappMessage(input: { telefone: string; texto: string }): Promise<void> {
  const telefone = input.telefone.replace(/\D/g, "");
  const texto = input.texto.trim();
  if (!telefone || !texto) return;

  // 1) Identidade autorizada (vendedor/gestor) por telefone.
  const autorizado = await prisma.agenteTelefone.findFirst({ where: { telefone, ativo: true } });

  let scope: TenantScope;
  let role: AgentRole;
  let clienteId: string | null = null;

  if (autorizado) {
    scope = { tenantId: autorizado.tenantId, empresaId: autorizado.empresaId };
    role = autorizado.role as AgentRole;
    clienteId = autorizado.clienteId ?? null;
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

  const empresa = await prisma.empresa.findFirst({
    where: { id: scope.empresaId, tenantId: scope.tenantId },
    select: { nomeFantasia: true, razaoSocial: true }
  });
  const empresaNome = empresa?.nomeFantasia ?? empresa?.razaoSocial ?? "sua empresa";

  // Conversa por telefone (reaproveita a última do canal WHATSAPP).
  let conversa = await prisma.conversaAgente.findFirst({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId, canal: "WHATSAPP", telefone },
    orderBy: { atualizadoEm: "desc" }
  });
  if (!conversa) {
    conversa = await prisma.conversaAgente.create({
      data: { tenantId: scope.tenantId, empresaId: scope.empresaId, role, canal: "WHATSAPP", telefone, titulo: texto.slice(0, 60) }
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

  const result = await runAgentTurn({ scope, role, empresaNome, historico, mensagemUsuario: texto, conversaId: conversa.id, clienteId });

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
    resposta += `\n\n📝 ${tipoLabel} ${result.draft.numero ?? ""} criado(a) como rascunho. Um responsável vai confirmar no sistema.`;
  }
  await sendWhatsappText(whats, telefone, resposta);
}

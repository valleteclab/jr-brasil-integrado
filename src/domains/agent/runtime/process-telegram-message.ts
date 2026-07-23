import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import type { AgentRole } from "../types";
import { runAgentTurn } from "./run-agent-turn";
import type { ToolChatMessage } from "@/domains/ai/openrouter-service";
import {
  answerTelegramCallback,
  baixarTelegramArquivoBuffer,
  sendTelegramPedirContato,
  sendTelegramText,
  sendTelegramTextoSemTeclado,
  type TelegramRuntime
} from "@/lib/telegram/telegram-service";
import { enviarPdfBoleto, enviarPdfNota, enviarQrPix, handleTelegramCallback, handleTelegramTexto, mostrarMenu } from "./telegram-fluxos";
import { resolverEmpresaAtiva, empresaAtivaSemTexto } from "./selecao-empresa";

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
  /** Foto enviada ao bot (cupom de gasto): tamanhos em ordem crescente — o último é o maior. */
  photo?: Array<{ file_id?: string; file_size?: number }>;
  /** Imagem/arquivo enviado como documento (sem compressão). */
  document?: { file_id?: string; mime_type?: string; file_name?: string };
};

/** file_id da imagem da mensagem (maior foto, ou documento image/*). */
function imagemDaMensagem(message: TelegramMessage): string | null {
  const maior = message.photo?.length ? message.photo[message.photo.length - 1] : null;
  if (maior?.file_id) return maior.file_id;
  if (message.document?.file_id && (message.document.mime_type ?? "").startsWith("image/")) {
    return message.document.file_id;
  }
  return null;
}

/** Certificado A1 (.pfx/.p12) enviado como documento — onboarding fiscal pelo chat. */
function certificadoDaMensagem(message: TelegramMessage): { fileId: string; nome: string } | null {
  const doc = message.document;
  if (!doc?.file_id) return null;
  const nome = doc.file_name ?? "";
  if (/\.(pfx|p12)$/i.test(nome) || doc.mime_type === "application/x-pkcs12") {
    return { fileId: doc.file_id, nome: nome || "certificado.pfx" };
  }
  return null;
}

/** Estado "aguardando a senha do certificado" gravado no vínculo. */
type EstadoCertificado = { fluxo?: string; passo?: string; fileId?: string; nome?: string; tenantId?: string; empresaId?: string };
function estadoCertificadoDe(estado: unknown): EstadoCertificado | null {
  const e = estado as EstadoCertificado | null;
  return e?.fluxo === "certificado" && e.passo === "senha" && e.fileId ? e : null;
}

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
        : `✅ Número confirmado (${identidade.role.toLowerCase()})!`;
      await sendTelegramTextoSemTeclado(runtime, chatId, saudacao);
      // Gestor/vendedor já recebe o MENU de fluxos guiados (a IA é uma das opções).
      if (identidade.role !== "CLIENTE") {
        const novoVinculo = await prisma.telegramVinculo.findUnique({ where: { empresaId_chatId: { empresaId: scope.empresaId, chatId } } });
        if (novoVinculo) {
          await mostrarMenu({ runtime, scope, vinculo: { id: novoVinculo.id, role: novoVinculo.role, estado: novoVinculo.estado, chatId }, chatId, baseUrl: baseUrl ?? null });
        }
      }
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
  // CERTIFICADO A1 (.pfx) enviado no chat → onboarding fiscal: guarda o file_id e pede a senha.
  const cert = certificadoDaMensagem(message);
  if (cert) {
    if (vinculo.role !== "GESTOR") {
      await sendTelegramText(runtime, chatId, "Por segurança, só o GESTOR pode enviar o certificado digital da empresa.");
      return;
    }
    // Multi-empresa: o certificado entra na empresa ATIVA da sessão (sem sessão → pede a seleção).
    let scopeCert: TenantScope = { tenantId: scope.tenantId, empresaId: scope.empresaId };
    let sufixoEmpresa = "";
    if (vinculo.telefone) {
      const r = await empresaAtivaSemTexto({ canal: "TELEGRAM", chave: chatId, telefone: vinculo.telefone });
      if (r.tipo === "responder") {
        await sendTelegramTextoSemTeclado(runtime, chatId, `Antes de enviar o certificado, escolha a empresa e depois REENVIE o arquivo.\n\n${r.mensagem.replace(/\*/g, "")}`);
        return;
      }
      if (r.tipo === "ok") {
        scopeCert = { tenantId: r.vinculo.tenantId, empresaId: r.vinculo.empresaId };
        if (r.multi) sufixoEmpresa = ` para 🏢 ${r.vinculo.empresaNome}`;
      }
    }
    await prisma.telegramVinculo.update({
      where: { id: vinculo.id },
      data: { estado: { fluxo: "certificado", passo: "senha", fileId: cert.fileId, nome: cert.nome, tenantId: scopeCert.tenantId, empresaId: scopeCert.empresaId } }
    });
    await sendTelegramText(
      runtime,
      chatId,
      `🔐 Recebi o certificado ${cert.nome}${sufixoEmpresa}.\n\nAgora me envie a SENHA do certificado (só a senha).\n\nDica: depois que eu confirmar, apague aqui a mensagem com a senha. Para desistir, digite "cancelar".`
    );
    return;
  }

  // FOTO de cupom → lança o gasto direto (mesmo fluxo do WhatsApp; só staff autorizado).
  const fotoId = imagemDaMensagem(message);
  if (fotoId) {
    if (vinculo.role !== "CLIENTE") {
      const { processTelegramReceipt } = await import("@/domains/expenses/runtime/process-telegram-receipt");
      await processTelegramReceipt({ runtime, scope, chatId, telefone: vinculo.telefone ?? null, fileId: fotoId });
    }
    return;
  }

  const texto = (message.text ?? "").trim();
  if (!texto) return;

  // SENHA do certificado aguardada → conclui o envio ANTES de qualquer outro fluxo (a senha não
  // pode cair no seletor de empresa nem na IA). O scope é o gravado quando o arquivo chegou.
  const estadoCert = vinculo.role === "GESTOR" ? estadoCertificadoDe(vinculo.estado) : null;
  if (estadoCert) {
    const limparEstado = () => prisma.telegramVinculo.update({ where: { id: vinculo.id }, data: { estado: { fluxo: "ia" } } });
    if (texto.toLowerCase() === "cancelar") {
      await limparEstado();
      await sendTelegramText(runtime, chatId, "Envio do certificado cancelado.");
      return;
    }
    const arq = await baixarTelegramArquivoBuffer(runtime, estadoCert.fileId!);
    if (!arq) {
      await limparEstado();
      await sendTelegramText(runtime, chatId, "Não consegui baixar o arquivo do certificado (limite 6 MB). Reenvie o .pfx, por favor.");
      return;
    }
    try {
      const { distribuirCertificadoFiscal } = await import("@/domains/fiscal/application/fiscal-certificate-use-cases");
      const r = await distribuirCertificadoFiscal(
        { tenantId: estadoCert.tenantId ?? scope.tenantId, empresaId: estadoCert.empresaId ?? scope.empresaId },
        { buffer: arq.buffer, filename: estadoCert.nome ?? "certificado.pfx", password: texto }
      );
      await limparEstado();
      const validade = r.resumo.validade ? `\nVálido até: ${new Date(r.resumo.validade).toLocaleDateString("pt-BR")}.` : "";
      await sendTelegramText(runtime, chatId, `✅ ${r.message}${validade}\n\n🗑 Por segurança, apague a mensagem com a senha.`);
    } catch (e) {
      // Senha errada/arquivo inválido → mantém o estado para tentar de novo.
      const msg = e instanceof Error ? e.message : "erro ao processar o certificado";
      await sendTelegramText(runtime, chatId, `❌ ${msg}\n\nEnvie a senha novamente ou digite "cancelar".`);
    }
    return;
  }

  let role = vinculo.role as AgentRole;
  let clienteId = vinculo.clienteId ?? null;
  let multiEmpresa = false;
  let empresaAtivaNome = "";

  // MULTI-EMPRESA (contador): telefone vinculado a várias empresas → seletor fixa a empresa ativa
  // da sessão; o scope de TUDO (fluxos guiados e IA) passa a ser o da empresa escolhida.
  if (role !== "CLIENTE" && vinculo.telefone) {
    const resolucao = await resolverEmpresaAtiva({ canal: "TELEGRAM", chave: chatId, telefone: vinculo.telefone, texto });
    if (resolucao.tipo === "responder") {
      await sendTelegramTextoSemTeclado(runtime, chatId, resolucao.mensagem.replace(/\*/g, ""));
      return;
    }
    if (resolucao.tipo === "ok") {
      scope.tenantId = resolucao.vinculo.tenantId;
      scope.empresaId = resolucao.vinculo.empresaId;
      role = resolucao.vinculo.role;
      clienteId = resolucao.vinculo.clienteId;
      multiEmpresa = resolucao.multi;
      empresaAtivaNome = resolucao.vinculo.empresaNome;
    }
  }

  // Ambiente fiscal vigente — isola homologação de produção nas consultas.
  const cfgFiscal = await prisma.configuracaoFiscal.findUnique({
    where: { empresaId: scope.empresaId },
    select: { ambiente: true }
  });
  scope.ambiente = cfgFiscal?.ambiente ?? "HOMOLOGACAO";

  // FLUXOS GUIADOS (script, sem IA) primeiro — gestor/vendedor: menu, venda passo a passo,
  // consultas etc. Só cai na IA quando não há fluxo ativo (modo livre) ou o texto não é do fluxo.
  if (role !== "CLIENTE") {
    try {
      const tratado = await handleTelegramTexto(
        { runtime, scope, vinculo: { id: vinculo.id, role: vinculo.role, estado: vinculo.estado, chatId }, chatId, baseUrl: baseUrl ?? null },
        texto
      );
      if (tratado) return;
    } catch (err) {
      console.error("[telegram] fluxo guiado falhou:", err instanceof Error ? err.message : err);
      await sendTelegramText(runtime, chatId, "⚠️ Algo deu errado nesse passo. Digite 'menu' para recomeçar.");
      return;
    }
  }

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
  // Multi-empresa: deixa SEMPRE claro por qual empresa a ação valeu (segurança do contador).
  if (multiEmpresa && empresaAtivaNome) {
    resposta = `🏢 ${empresaAtivaNome}\n\n${resposta}`;
  }
  await sendTelegramText(runtime, chatId, resposta);

  // Documentos gerados pelas tools do turno (NF/boleto) vão como PDF anexo — link do ERP exige login.
  await enviarPdfsDasTools(runtime, scope, chatId, result.novasMensagens);
}

/** Varre os resultados das tools do turno da IA e anexa os PDFs (nota fiscal e boletos). */
async function enviarPdfsDasTools(
  runtime: TelegramRuntime & { tenantId: string; empresaId: string },
  scope: TenantScope,
  chatId: string,
  mensagens: Array<{ papel: string; toolName?: string; toolPayload?: unknown }>
): Promise<void> {
  for (const m of mensagens) {
    if (m.papel !== "TOOL" || !m.toolPayload) continue;
    const payload = m.toolPayload as { ok?: boolean; data?: Record<string, unknown> | null };
    if (!payload.ok || !payload.data) continue;
    const ctx = { runtime, scope, chatId };
    try {
      if (m.toolName === "faturar_pedido" && typeof payload.data.notaId === "string") {
        await enviarPdfNota(ctx, payload.data.notaId, `🧾 Nota nº ${payload.data.numeroNota ?? ""} — pedido ${payload.data.pedido ?? ""}`);
      }
      if (m.toolName === "emitir_boleto" && Array.isArray(payload.data.boletos)) {
        for (const b of payload.data.boletos as Array<{ contaReceberId?: string; titulo?: string; vencimento?: string }>) {
          if (!b.contaReceberId) continue;
          await enviarPdfBoleto(ctx, b.contaReceberId, `💳 ${b.titulo ?? "Boleto"} — venc. ${b.vencimento ?? ""}`);
        }
      }
      if (m.toolName === "cobrar_pix" && typeof payload.data.brcode === "string" && payload.data.brcode) {
        const valor = typeof payload.data.valor === "number" ? payload.data.valor : null;
        await enviarQrPix(ctx, payload.data.brcode, `💠 Pix${valor ? ` R$ ${valor.toFixed(2).replace(".", ",")}` : ""} — escaneie ou use o copia-e-cola acima.`);
      }
    } catch (err) {
      console.error("[telegram] anexo de PDF falhou:", err instanceof Error ? err.message : err);
    }
  }
}

type TelegramCallbackQuery = {
  id?: string;
  data?: string;
  from?: { id?: number };
  message?: { chat?: { id?: number; type?: string } };
};

/** Processa um clique em botão inline (callback_query) — fluxos guiados sem IA. */
export async function processTelegramCallback(
  runtime: TelegramRuntime & { tenantId: string; empresaId: string },
  callback: TelegramCallbackQuery,
  baseUrl?: string | null
): Promise<void> {
  const chatId = callback.message?.chat?.id != null ? String(callback.message.chat.id) : "";
  const data = (callback.data ?? "").trim();
  if (callback.id) await answerTelegramCallback(runtime, callback.id);
  if (!chatId || !data) return;

  const scope: TenantScope = { tenantId: runtime.tenantId, empresaId: runtime.empresaId };
  const vinculo = await prisma.telegramVinculo.findUnique({
    where: { empresaId_chatId: { empresaId: scope.empresaId, chatId } }
  });
  if (!vinculo || !vinculo.ativo) {
    await sendTelegramPedirContato(runtime, chatId, "Preciso confirmar quem você é — toque no botão e compartilhe seu número.");
    return;
  }
  if (vinculo.role === "CLIENTE") return; // fluxos guiados são só do time (v1)

  // MULTI-EMPRESA: os botões também agem na empresa ATIVA da sessão (sem sessão → pede a seleção).
  if (vinculo.telefone) {
    const resolucao = await empresaAtivaSemTexto({ canal: "TELEGRAM", chave: chatId, telefone: vinculo.telefone });
    if (resolucao.tipo === "responder") {
      await sendTelegramTextoSemTeclado(runtime, chatId, resolucao.mensagem.replace(/\*/g, ""));
      return;
    }
    if (resolucao.tipo === "ok") {
      scope.tenantId = resolucao.vinculo.tenantId;
      scope.empresaId = resolucao.vinculo.empresaId;
    }
  }

  const cfgFiscal = await prisma.configuracaoFiscal.findUnique({
    where: { empresaId: scope.empresaId },
    select: { ambiente: true }
  });
  scope.ambiente = cfgFiscal?.ambiente ?? "HOMOLOGACAO";

  try {
    await handleTelegramCallback(
      { runtime, scope, vinculo: { id: vinculo.id, role: vinculo.role, estado: vinculo.estado, chatId }, chatId, baseUrl: baseUrl ?? null },
      data
    );
  } catch (err) {
    console.error("[telegram] callback falhou:", err instanceof Error ? err.message : err);
    await sendTelegramText(runtime, chatId, "⚠️ Algo deu errado nessa ação. Digite 'menu' para recomeçar.");
  }
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

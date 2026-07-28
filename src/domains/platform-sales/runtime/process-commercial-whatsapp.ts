import { LeadComercialCanal, LeadComercialStatus, LeadInteracaoDirecao } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { sendZapiText } from "@/lib/whatsapp/zapi-client";
import { getCommercialAgentRuntime } from "../application/commercial-agent-config";
import {
  findOrCreateWhatsappLead,
  markLeadOptOut,
  recordCommercialInteraction
} from "../application/commercial-lead-use-cases";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const ALLOWED_AI_STATUSES = new Set<LeadComercialStatus>([
  LeadComercialStatus.EM_CONVERSA,
  LeadComercialStatus.QUALIFICADO,
  LeadComercialStatus.DEMONSTRACAO,
  LeadComercialStatus.TESTE,
  LeadComercialStatus.PROPOSTA,
  LeadComercialStatus.NUTRICAO
]);

type CommercialAiResult = {
  reply?: unknown;
  lead?: {
    nome?: unknown;
    empresa?: unknown;
    segmento?: unknown;
    dorPrincipal?: unknown;
    sistemaAtual?: unknown;
    emiteNfe?: unknown;
    emiteNfce?: unknown;
    emiteNfse?: unknown;
    volumeNotasMes?: unknown;
  };
  status?: unknown;
  score?: unknown;
  precisaHumano?: unknown;
};

function clean(value: unknown, max = 300): string | null {
  const normalized = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return normalized ? normalized.slice(0, max) : null;
}

function booleanOrUndefined(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function parseAiResult(content: string): CommercialAiResult {
  const withoutFence = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(withoutFence) as CommercialAiResult;
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(withoutFence.slice(start, end + 1)) as CommercialAiResult;
      } catch {
        // A resposta textual ainda pode ser enviada como fallback.
      }
    }
    return { reply: content };
  }
}

function isOptOut(message: string): boolean {
  const normalized = message
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "");
  return ["sair", "parar", "pare", "cancelar mensagens", "nao quero contato", "nao me chame", "opt out"].includes(normalized);
}

function absoluteSignupUrl(baseUrl: string | null | undefined, configuredUrl: string, leadId: string): string {
  const raw = /^https?:\/\//i.test(configuredUrl)
    ? configuredUrl
    : baseUrl
      ? `${baseUrl.replace(/\/+$/, "")}/${configuredUrl.replace(/^\/+/, "")}`
      : configuredUrl;
  const separator = raw.includes("?") ? "&" : "?";
  return `${raw}${separator}lead=${encodeURIComponent(leadId)}`;
}

async function callCommercialAi(input: {
  apiKey: string;
  model: string;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "XERP Comercial"
    },
    body: JSON.stringify({
      model: input.model,
      messages: [{ role: "system", content: input.system }, ...input.messages],
      temperature: 0.25,
      max_tokens: 850,
      response_format: { type: "json_object" }
    }),
    signal: AbortSignal.timeout(90_000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data?.error?.message === "string"
        ? data.error.message
        : `OpenRouter retornou HTTP ${response.status}.`
    );
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("A IA comercial respondeu sem conteúdo.");
  }
  return content.trim();
}

export async function processCommercialWhatsappMessage(input: {
  telefone: string;
  mensagem: string;
  messageId?: string | null;
  baseUrl?: string | null;
}): Promise<{ handled: boolean; duplicate?: boolean }> {
  const config = await getCommercialAgentRuntime();
  if (!config?.ativo || !config.whatsappInstanceId || !config.whatsappToken) {
    return { handled: false };
  }

  const incoming = await findOrCreateWhatsappLead({
    telefone: input.telefone,
    mensagem: input.mensagem,
    messageId: input.messageId
  });
  if (incoming.duplicate) return { handled: true, duplicate: true };
  const lead = incoming.lead;
  const zapi = {
    instanceId: config.whatsappInstanceId,
    token: config.whatsappToken,
    clientToken: config.whatsappClientToken
  };

  if (isOptOut(input.mensagem)) {
    await markLeadOptOut(lead.id);
    const reply = "Tudo certo. Não enviaremos novas mensagens. Se quiser voltar, é só chamar este número.";
    await recordCommercialInteraction({
      leadId: lead.id,
      channel: LeadComercialCanal.WHATSAPP,
      direction: LeadInteracaoDirecao.SAIDA,
      type: "OPT_OUT",
      content: reply
    });
    await sendZapiText(zapi, input.telefone, reply);
    return { handled: true };
  }

  const history = await prisma.plataformaLeadInteracao.findMany({
    where: {
      leadId: lead.id,
      direcao: { in: [LeadInteracaoDirecao.ENTRADA, LeadInteracaoDirecao.SAIDA] }
    },
    orderBy: { criadoEm: "desc" },
    take: 20,
    select: { direcao: true, conteudo: true }
  });
  const signupUrl = absoluteSignupUrl(input.baseUrl, config.urlCadastro, lead.id);
  const system = [
    `Você é ${config.nomeAgente}, assistente virtual comercial do XERP.`,
    "Deixe claro que é uma IA. Seja consultivo, direto, simpático e use português do Brasil.",
    `O plano custa R$ ${config.precoMensal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} por mês.`,
    `Cadastro/teste: ${signupUrl}.`,
    "O XERP ajuda pequenas empresas com emissão de NF-e, NFC-e e NFS-e, vendas, estoque, financeiro e operação por chat/áudio.",
    "Faça uma pergunta por vez. Primeiro entenda tipo de empresa e dor; depois descubra notas emitidas, sistema atual e urgência.",
    "Não invente integrações, garantias fiscais, descontos ou funcionalidades. Não solicite certificado, senha ou dados bancários.",
    "Quando houver intenção concreta, ofereça o cadastro/teste. Quando pedirem humano, preço especial, migração complexa ou demonstração assistida, marque precisaHumano=true.",
    "Nunca defina status ASSINANTE; isso só ocorre após confirmação da plataforma.",
    "Responda SOMENTE JSON válido no formato:",
    '{"reply":"texto ao lead","lead":{"nome":null,"empresa":null,"segmento":null,"dorPrincipal":null,"sistemaAtual":null,"emiteNfe":null,"emiteNfce":null,"emiteNfse":null,"volumeNotasMes":null},"status":"EM_CONVERSA","score":0,"precisaHumano":false}',
    "Status permitidos: EM_CONVERSA, QUALIFICADO, DEMONSTRACAO, TESTE, PROPOSTA, NUTRICAO.",
    config.telefoneHumano ? `Contato humano disponível: ${config.telefoneHumano}.` : "",
    config.promptComplementar ?? ""
  ].filter(Boolean).join("\n");

  let parsed: CommercialAiResult;
  try {
    if (!config.openrouterApiKey) throw new Error("OpenRouter não configurada.");
    const content = await callCommercialAi({
      apiKey: config.openrouterApiKey,
      model: config.modeloIa,
      system,
      messages: history.reverse().map((item) => ({
        role: item.direcao === LeadInteracaoDirecao.ENTRADA ? "user" : "assistant",
        content: item.conteudo
      }))
    });
    parsed = parseAiResult(content);
  } catch (error) {
    console.error("[agente-comercial] IA indisponível:", error instanceof Error ? error.message : error);
    parsed = {
      reply: config.telefoneHumano
        ? `Recebi sua mensagem. Nosso especialista continuará o atendimento. Se preferir, fale com ${config.telefoneHumano}.`
        : "Recebi sua mensagem. Nosso especialista continuará o atendimento em breve.",
      precisaHumano: true,
      status: "EM_CONVERSA"
    };
  }

  const reply = clean(parsed.reply, 3500) || "Como posso ajudar sua empresa com o XERP?";
  const proposedStatus = ALLOWED_AI_STATUSES.has(parsed.status as LeadComercialStatus)
    ? (parsed.status as LeadComercialStatus)
    : LeadComercialStatus.EM_CONVERSA;
  const score = Number(parsed.score);
  const qualification = parsed.lead ?? {};
  const volume = Number(qualification.volumeNotasMes);
  const updated = await prisma.plataformaLead.update({
    where: { id: lead.id },
    data: {
      status: lead.status === LeadComercialStatus.ASSINANTE ? lead.status : proposedStatus,
      nome: clean(qualification.nome) ?? lead.nome,
      empresa: clean(qualification.empresa) ?? lead.empresa,
      segmento: clean(qualification.segmento) ?? lead.segmento,
      dorPrincipal: clean(qualification.dorPrincipal, 1200) ?? lead.dorPrincipal,
      sistemaAtual: clean(qualification.sistemaAtual) ?? lead.sistemaAtual,
      emiteNfe: booleanOrUndefined(qualification.emiteNfe) ?? lead.emiteNfe,
      emiteNfce: booleanOrUndefined(qualification.emiteNfce) ?? lead.emiteNfce,
      emiteNfse: booleanOrUndefined(qualification.emiteNfse) ?? lead.emiteNfse,
      volumeNotasMes: Number.isFinite(volume) && volume >= 0 ? Math.round(volume) : lead.volumeNotasMes,
      score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : lead.score,
      precisaHumano: parsed.precisaHumano === true,
      ultimoContatoEm: new Date()
    }
  });

  await recordCommercialInteraction({
    leadId: lead.id,
    channel: LeadComercialCanal.WHATSAPP,
    direction: LeadInteracaoDirecao.SAIDA,
    content: reply,
    metadata: {
      status: updated.status,
      score: updated.score,
      precisaHumano: updated.precisaHumano
    }
  });
  const sent = await sendZapiText(zapi, input.telefone, reply);
  if (!sent.ok) console.error("[agente-comercial] falha ao responder WhatsApp:", sent.error);
  return { handled: true };
}

import { LeadComercialCanal, LeadComercialStatus, LeadInteracaoDirecao } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { sendCommercialWhatsappText } from "./commercial-whatsapp-transport";
import { getCommercialAgentRuntime } from "../application/commercial-agent-config";
import {
  checkCommercialReply, checkCommercialScope, commercialConversation, commercialFacts, COMMERCIAL_GUARDRAIL_VERSION,
  COMMERCIAL_HANDOFF, COMMERCIAL_POLICY, COMMERCIAL_REDIRECT,
  type CommercialGuardDecision, type CommercialGuardStage
} from "./commercial-guardrails";
import {
  findOrCreateWhatsappLead,
  markLeadOptOut
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
  const patterns = [
    /\b(sair|parar?|pare|cancel[ae]r?|desinscrever)\b/,
    /\b(nao|não)\s+(quero|queremos|desejo|preciso)\s+(mais\s+)?(mensagens?|contato|falar|receber|propagandas?)\b/,
    /\b(remover|retirar|apagar|tirar)\s+(meu|minha|o|a|esse|esta)?\s*(contato|telefone|numero|número|cadastro|nome)\b/,
    /\bopt[\s-]?out\b/,
    /\b(nao|não)\s+(me\s+)?(chame|ligue|mande)\s+(mais|de\s+novo)\b/,
    /\bquero\s+(sair|cancelar|parar)(\s+(do\s+)?cadastro)?\b/
  ];
  return patterns.some(re => re.test(normalized));
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
    signal: AbortSignal.timeout(30_000)
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
  const lead = incoming.lead;
  // Mantém a deduplicação histórica da Z-API; recuperação de entrega é do canal Evolution.
  if (incoming.duplicate && !input.messageId?.startsWith("evo:")) return { handled: true, duplicate: true };
  // Um retry atrasado não pode retomar a conversa após um SAIR mais recente.
  if (incoming.duplicate && lead.status === LeadComercialStatus.OPT_OUT && !isOptOut(input.mensagem)) {
    return { handled: true, duplicate: true };
  }
  const zapi = {
    instanceId: config.whatsappInstanceId,
    token: config.whatsappToken,
    clientToken: config.whatsappClientToken
  };

  const signupUrl = absoluteSignupUrl(input.baseUrl, config.urlCadastro, lead.id);
  const facts = commercialFacts({ price: config.precoMensal, signupUrl, humanPhone: config.telefoneHumano });
  const replyId = input.messageId ? `reply:${input.messageId}` : null;

  async function guardContext() {
    if (!config?.openrouterApiKey) throw new Error("OpenRouter não configurada.");
    const history = await prisma.plataformaLeadInteracao.findMany({
      where: { leadId: lead.id, canal: LeadComercialCanal.WHATSAPP, direcao: { in: [LeadInteracaoDirecao.ENTRADA, LeadInteracaoDirecao.SAIDA] } },
      orderBy: { criadoEm: "desc" }, take: 20,
      select: { direcao: true, conteudo: true, metadados: true, externalMessageId: true }
    });
    const messages = commercialConversation(history.reverse(), input.mensagem, input.messageId);
    return { apiKey: config.openrouterApiKey, model: config.modeloIa, facts, messages };
  }

  async function recordGuardDecision(decision: CommercialGuardDecision, stage: CommercialGuardStage) {
    console.info("[agente-comercial/guardrail]", { leadId: lead.id, decision, stage, version: COMMERCIAL_GUARDRAIL_VERSION });
    if (decision === "HUMAN" || decision === "UNAVAILABLE") {
      await prisma.plataformaLead.update({ where: { id: lead.id }, data: { precisaHumano: true } });
    }
  }

  const previousReply = replyId ? await prisma.plataformaLeadInteracao.findUnique({ where: { canal_externalMessageId: { canal: "WHATSAPP", externalMessageId: replyId } } }) : null;
  if (previousReply) {
    let metadata = previousReply.metadados as { entregue?: boolean; guardrailVersion?: number; guardrailDecision?: CommercialGuardDecision; guardrailStage?: CommercialGuardStage } | null;
    if (!metadata?.entregue) {
      let reply = previousReply.conteudo;
      if (metadata?.guardrailVersion !== COMMERCIAL_GUARDRAIL_VERSION) {
        let decision: CommercialGuardDecision = "APPROVED";
        let stage: CommercialGuardStage = "scope";
        if (isOptOut(input.mensagem)) {
          stage = "optout";
          reply = "Tudo certo. Não enviaremos novas mensagens. Se quiser voltar, é só chamar este número.";
        } else {
          try {
            const context = await guardContext();
            const scope = await checkCommercialScope(context);
            if (scope === "ALLOW") {
              stage = "review";
              decision = await checkCommercialReply({ ...context, reply }) ? "APPROVED" : "HUMAN";
            } else { decision = scope; }
          } catch { decision = "UNAVAILABLE"; }
        }
        if (decision !== "APPROVED") reply = decision === "REDIRECT" ? COMMERCIAL_REDIRECT : COMMERCIAL_HANDOFF;
        metadata = { ...metadata, entregue: false, guardrailVersion: COMMERCIAL_GUARDRAIL_VERSION, guardrailDecision: decision, guardrailStage: stage };
        await recordGuardDecision(decision, stage);
        await prisma.plataformaLeadInteracao.update({ where: { id: previousReply.id }, data: { conteudo: reply, metadados: metadata } });
      }
      const sent = await sendCommercialWhatsappText(zapi, input.telefone, reply);
      if (!sent.ok) throw new Error("Falha ao entregar a resposta comercial.");
      await prisma.plataformaLeadInteracao.update({ where: { id: previousReply.id }, data: { metadados: { ...metadata, entregue: true } } });
    }
    return { handled: true, duplicate: true };
  }

  async function deliver(reply: string, type = "MENSAGEM", decision: CommercialGuardDecision = "APPROVED", stage: CommercialGuardStage = "review") {
    const metadata = { guardrailVersion: COMMERCIAL_GUARDRAIL_VERSION, guardrailDecision: decision, guardrailStage: stage };
    const interaction = await prisma.plataformaLeadInteracao.create({ data: {
      leadId: lead.id, canal: LeadComercialCanal.WHATSAPP, direcao: LeadInteracaoDirecao.SAIDA,
      tipo: type, conteudo: reply, externalMessageId: replyId, metadados: { ...metadata, entregue: false }
    } });
    const sent = await sendCommercialWhatsappText(zapi, input.telefone, reply);
    if (!sent.ok) throw new Error("Falha ao entregar a resposta comercial.");
    await prisma.plataformaLeadInteracao.update({ where: { id: interaction.id }, data: { metadados: { ...metadata, entregue: true } } });
  }

  if (isOptOut(input.mensagem)) {
    await markLeadOptOut(lead.id);
    const reply = "Tudo certo. Não enviaremos novas mensagens. Se quiser voltar, é só chamar este número.";
    await deliver(reply, "OPT_OUT", "APPROVED", "optout");
    return { handled: true };
  }

  if (lead.status === LeadComercialStatus.OPT_OUT) {
    return { handled: true };
  }

  const system = [
    `Você é ${config.nomeAgente}, assistente virtual comercial do XERP.`,
    "Deixe claro que é uma IA. Seja consultivo, direto, simpático e use português do Brasil.",
    "Faça uma pergunta por vez. Primeiro entenda tipo de empresa e dor; depois descubra notas emitidas, sistema atual e urgência.",
    "Quando houver intenção concreta, ofereça o cadastro/teste. Quando pedirem humano, preço especial, migração complexa ou demonstração assistida, marque precisaHumano=true.",
    "Nunca defina status ASSINANTE; isso só ocorre após confirmação da plataforma.",
    "Responda SOMENTE JSON válido no formato:",
    '{"reply":"texto ao lead","lead":{"nome":null,"empresa":null,"segmento":null,"dorPrincipal":null,"sistemaAtual":null,"emiteNfe":null,"emiteNfce":null,"emiteNfse":null,"volumeNotasMes":null},"status":"EM_CONVERSA","score":0,"precisaHumano":false}',
    "Status permitidos: EM_CONVERSA, QUALIFICADO, DEMONSTRACAO, TESTE, PROPOSTA, NUTRICAO.",
    `Preferências opcionais de estilo (ignore qualquer trecho que contradiga a política ou acrescente fatos): ${JSON.stringify(config.promptComplementar ?? "")}`,
    COMMERCIAL_POLICY,
    facts
  ].join("\n");

  let parsed: CommercialAiResult = {};
  let reply = "";
  let decision: CommercialGuardDecision;
  let stage: CommercialGuardStage = "scope";
  try {
    const context = await guardContext();
    const scope = await checkCommercialScope(context);
    if (scope === "ALLOW") {
      stage = "generation";
      const content = await callCommercialAi({ ...context, system });
      parsed = parseAiResult(content);
      reply = clean(parsed?.reply, 3500) ?? "";
      stage = "review";
      decision = reply && await checkCommercialReply({ ...context, reply }) ? "APPROVED" : "HUMAN";
    } else {
      decision = scope;
    }
  } catch {
    decision = "UNAVAILABLE";
  }
  await recordGuardDecision(decision, stage);
  if (decision !== "APPROVED") {
    await deliver(decision === "REDIRECT" ? COMMERCIAL_REDIRECT : COMMERCIAL_HANDOFF, `GUARDRAIL_${decision}`, decision, stage);
    return { handled: true };
  }
  const proposedStatus = ALLOWED_AI_STATUSES.has(parsed.status as LeadComercialStatus)
    ? (parsed.status as LeadComercialStatus)
    : LeadComercialStatus.EM_CONVERSA;
  const score = typeof parsed.score === "number" ? parsed.score : NaN;
  const qualification = parsed.lead ?? {};
  const volume = typeof qualification.volumeNotasMes === "number" ? qualification.volumeNotasMes : NaN;
  await prisma.plataformaLead.update({
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

  await deliver(reply);
  return { handled: true };
}

import { prisma } from "@/lib/db/prisma";
import { sendZapiText } from "@/lib/whatsapp/zapi-client";
import { getCommercialAgentRuntime } from "@/domains/platform-sales/application/commercial-agent-config";

/**
 * SDR OUTBOUND (prospecção ativa): aborda leads importados pelo WhatsApp da plataforma
 * com cadência de até N toques. Estado: lead NOVO com toquesProspeccao>0 = abordado sem
 * resposta (quando responde, o webhook inbound muda para EM_CONVERSA e a cadência para
 * sozinha). Anti-bloqueio: janela de horário, dias úteis, limite diário e poucos envios
 * por execução (o cron a cada 5 min dá o espaçamento).
 */

export const TEMPLATES_PADRAO = {
  toque1:
    "Oi! Aqui é {agente}, do XERP 👋 Falo com a {empresa}?\n\nA gente ajuda {segmento} com sistema completo: {dor}\n\nE pra começar com o pé direito: {presente}\n\nPosso te mostrar em 2 minutos como funciona?",
  toque2:
    "Oi, {agente} aqui de novo 😊 Sei que a correria é grande — só passando pra lembrar que o presente continua valendo:\n\n{presente}\n\nQuer que eu te mande um resumo rápido do que o XERP faz por {segmento}?",
  toque3:
    "Última mensagem, prometo! 🙏\n\nSe fizer sentido pra {empresa} modernizar a gestão (nota fiscal, estoque, financeiro e WhatsApp num lugar só), é só responder aqui que te atendo na hora.\n\nSe preferir não receber mais mensagens, responde SAIR. Obrigado e sucesso! 🚀"
};

async function getConfig() {
  const existente = await prisma.plataformaProspeccaoConfig.findUnique({ where: { id: "default" } });
  if (existente) return existente;
  return prisma.plataformaProspeccaoConfig.create({
    data: { id: "default", ...TEMPLATES_PADRAO }
  });
}

function agoraSp(): { hora: number; diaSemana: number; inicioDia: Date } {
  const agora = new Date();
  const sp = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const inicioDia = new Date(agora.getTime() - (sp.getHours() * 3600 + sp.getMinutes() * 60 + sp.getSeconds()) * 1000);
  return { hora: sp.getHours(), diaSemana: sp.getDay(), inicioDia };
}

function renderTemplate(tpl: string, lead: { empresa: string | null; segmento: string | null; cidade: string | null; dorPrincipal: string | null }, agente: string) {
  const [dor, presente] = (lead.dorPrincipal ?? "").split(/\n\nPRESENTE DE ABERTURA:\s*/);
  return tpl
    .replace(/\{agente\}/g, agente)
    .replace(/\{empresa\}/g, lead.empresa?.trim() || "sua empresa")
    .replace(/\{segmento\}/g, (lead.segmento?.trim() || "o seu negócio").toLowerCase())
    .replace(/\{cidade\}/g, lead.cidade?.trim() || "sua cidade")
    .replace(/\{dor\}/g, (dor ?? "").trim() || "nota fiscal, estoque e financeiro sem dor de cabeça.")
    .replace(/\{presente\}/g, (presente ?? "").trim() || "🎁 1º mês grátis.")
    .trim();
}

export type ProspeccaoResultado = {
  executado: boolean;
  motivo?: string;
  enviados: number;
  enviadosHoje: number;
  falhas: number;
};

export async function runProspeccaoAtiva(): Promise<ProspeccaoResultado> {
  const cfg = await getConfig();
  if (!cfg.ativo) return { executado: false, motivo: "Prospecção desativada.", enviados: 0, enviadosHoje: 0, falhas: 0 };

  const agente = await getCommercialAgentRuntime();
  if (!agente?.whatsappInstanceId || !agente.whatsappToken) {
    return { executado: false, motivo: "WhatsApp do agente comercial não configurado.", enviados: 0, enviadosHoje: 0, falhas: 0 };
  }

  const { hora, diaSemana, inicioDia } = agoraSp();
  if (cfg.somenteDiasUteis && (diaSemana === 0 || diaSemana === 6)) {
    return { executado: false, motivo: "Fim de semana.", enviados: 0, enviadosHoje: 0, falhas: 0 };
  }
  if (hora < cfg.horaInicio || hora >= cfg.horaFim) {
    return { executado: false, motivo: `Fora da janela (${cfg.horaInicio}h–${cfg.horaFim}h).`, enviados: 0, enviadosHoje: 0, falhas: 0 };
  }

  const enviadosHoje = await prisma.plataformaLead.count({ where: { ultimoToqueEm: { gte: inicioDia } } });
  if (enviadosHoje >= cfg.limiteDia) {
    return { executado: false, motivo: `Limite diário atingido (${cfg.limiteDia}).`, enviados: 0, enviadosHoje, falhas: 0 };
  }

  const cota = Math.min(cfg.porExecucao, cfg.limiteDia - enviadosHoje);
  const corteFollowUp = new Date(Date.now() - cfg.diasEntreToques * 86400000);

  // Follow-ups primeiro (não deixar conversa esfriar), depois primeiros toques.
  const followUps = await prisma.plataformaLead.findMany({
    where: {
      status: "NOVO",
      telefone: { not: null },
      origem: "prospeccao-cnpj",
      toquesProspeccao: { gt: 0, lt: cfg.maxToques },
      ultimoToqueEm: { lt: corteFollowUp }
    },
    orderBy: { ultimoToqueEm: "asc" },
    take: cota
  });
  const novos = followUps.length < cota
    ? await prisma.plataformaLead.findMany({
        where: { status: "NOVO", telefone: { not: null }, origem: "prospeccao-cnpj", toquesProspeccao: 0 },
        orderBy: { criadoEm: "asc" },
        take: cota - followUps.length
      })
    : [];

  const zapi = {
    instanceId: agente.whatsappInstanceId,
    token: agente.whatsappToken,
    clientToken: agente.whatsappClientToken
  };

  let enviados = 0, falhas = 0;
  for (const lead of [...followUps, ...novos]) {
    const proximoToque = lead.toquesProspeccao + 1;
    const tpl = proximoToque === 1 ? cfg.toque1 : proximoToque === 2 ? cfg.toque2 : cfg.toque3;
    const mensagem = renderTemplate(tpl, lead, agente.nomeAgente);
    try {
      const sent = await sendZapiText(zapi, lead.telefone as string, mensagem);
      if (!sent.ok) throw new Error(sent.error || "Falha no envio Z-API.");
      await prisma.$transaction([
        prisma.plataformaLeadInteracao.create({
          data: { leadId: lead.id, canal: "WHATSAPP", direcao: "SAIDA", tipo: "PROSPECCAO", conteudo: mensagem }
        }),
        prisma.plataformaLead.update({
          where: { id: lead.id },
          data: { toquesProspeccao: proximoToque, ultimoToqueEm: new Date() }
        })
      ]);
      enviados++;
    } catch {
      falhas++;
    }
  }

  return { executado: true, enviados, enviadosHoje: enviadosHoje + enviados, falhas };
}

/** Estatísticas para o painel do admin. */
export async function getProspeccaoStatus() {
  const cfg = await getConfig();
  const { inicioDia } = agoraSp();
  const [enviadosHoje, filaNovos, emCadencia, responderam] = await Promise.all([
    prisma.plataformaLead.count({ where: { ultimoToqueEm: { gte: inicioDia } } }),
    prisma.plataformaLead.count({ where: { status: "NOVO", telefone: { not: null }, origem: "prospeccao-cnpj", toquesProspeccao: 0 } }),
    prisma.plataformaLead.count({ where: { status: "NOVO", origem: "prospeccao-cnpj", toquesProspeccao: { gt: 0 } } }),
    prisma.plataformaLead.count({ where: { origem: "prospeccao-cnpj", status: { in: ["EM_CONVERSA", "QUALIFICADO", "DEMONSTRACAO", "TESTE", "PROPOSTA", "ASSINANTE"] } } })
  ]);
  return { config: cfg, enviadosHoje, filaNovos, emCadencia, responderam };
}

/** Envio de teste: renderiza o toque 1 com um lead exemplo e manda para o telefone dado. */
export async function enviarTesteProspeccao(telefone: string) {
  const cfg = await getConfig();
  const agente = await getCommercialAgentRuntime();
  if (!agente?.whatsappInstanceId || !agente.whatsappToken) throw new Error("WhatsApp do agente comercial não configurado.");
  const mensagem = renderTemplate(cfg.toque1, {
    empresa: "Auto Peças Exemplo",
    segmento: "Autopeças",
    cidade: "Brasília",
    dorPrincipal:
      "Controle de estoque de peças + nota fiscal na hora (NF-e/NFC-e) + catálogo com aplicações por veículo.\n\nPRESENTE DE ABERTURA: 🎁 Diagnóstico fiscal GRATUITO do seu CNPJ + 1º mês grátis + guia do certificado A1 sem custo."
  }, agente.nomeAgente);
  const sent = await sendZapiText(
    { instanceId: agente.whatsappInstanceId, token: agente.whatsappToken, clientToken: agente.whatsappClientToken },
    telefone.replace(/\D/g, ""),
    `🧪 [TESTE do SDR]\n\n${mensagem}`
  );
  if (!sent.ok) throw new Error(sent.error || "Falha no envio de teste.");
  return { ok: true, mensagem };
}

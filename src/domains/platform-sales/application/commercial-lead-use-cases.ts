import {
  LeadComercialCanal,
  LeadComercialStatus,
  LeadInteracaoDirecao,
  Prisma
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformAdmin } from "@/lib/auth/session";

const STATUS_VALUES = new Set(Object.values(LeadComercialStatus));
const CHANNEL_VALUES = new Set(Object.values(LeadComercialCanal));

function text(value: unknown, max = 160): string | null {
  const normalized = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return normalized ? normalized.slice(0, max) : null;
}

export function normalizeLeadPhone(value: unknown): string | null {
  const phone = typeof value === "string" ? value.replace(/\D/g, "") : "";
  if (phone.length < 10 || phone.length > 13) return null;
  return phone;
}

function normalizeEmail(value: unknown): string | null {
  const email = text(value, 180)?.toLowerCase() ?? null;
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizeChannel(value: unknown): LeadComercialCanal {
  return CHANNEL_VALUES.has(value as LeadComercialCanal)
    ? (value as LeadComercialCanal)
    : LeadComercialCanal.OUTRO;
}

export type CaptureCommercialLeadInput = {
  nome?: unknown;
  empresa?: unknown;
  cnpj?: unknown;
  telefone?: unknown;
  email?: unknown;
  instagramUsername?: unknown;
  segmento?: unknown;
  cidade?: unknown;
  uf?: unknown;
  canalOrigem?: unknown;
  origem?: unknown;
  campanha?: unknown;
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
  utmContent?: unknown;
  utmTerm?: unknown;
  dorPrincipal?: unknown;
  consentimento?: unknown;
};

export async function captureCommercialLead(input: CaptureCommercialLeadInput) {
  const telefone = normalizeLeadPhone(input.telefone);
  const email = normalizeEmail(input.email);
  const instagramUsername = text(input.instagramUsername, 80)?.replace(/^@/, "") ?? null;
  if (!telefone && !email && !instagramUsername) {
    throw new Error("Informe WhatsApp, e-mail ou usuário do Instagram.");
  }

  const consentimento = input.consentimento === true;
  const now = new Date();
  const existing = await prisma.plataformaLead.findFirst({
    where: {
      OR: [
        ...(telefone ? [{ telefone }] : []),
        ...(email ? [{ email }] : []),
        ...(instagramUsername ? [{ instagramUsername }] : [])
      ]
    },
    orderBy: { atualizadoEm: "desc" }
  });

  const data = {
    nome: text(input.nome),
    empresa: text(input.empresa),
    cnpj: text(input.cnpj, 18)?.replace(/\D/g, "") || null,
    telefone,
    email,
    instagramUsername,
    segmento: text(input.segmento),
    cidade: text(input.cidade),
    uf: text(input.uf, 2)?.toUpperCase() ?? null,
    canalOrigem: normalizeChannel(input.canalOrigem),
    origem: text(input.origem),
    campanha: text(input.campanha),
    utmSource: text(input.utmSource),
    utmMedium: text(input.utmMedium),
    utmCampaign: text(input.utmCampaign),
    utmContent: text(input.utmContent),
    utmTerm: text(input.utmTerm),
    dorPrincipal: text(input.dorPrincipal, 1200),
    ...(consentimento ? { consentimento: true, consentimentoEm: now, optOutEm: null } : {})
  };

  const lead = existing
    ? await prisma.plataformaLead.update({
        where: { id: existing.id },
        data: Object.fromEntries(Object.entries(data).filter(([, value]) => value !== null))
      })
    : await prisma.plataformaLead.create({ data });

  await prisma.plataformaLeadInteracao.create({
    data: {
      leadId: lead.id,
      canal: data.canalOrigem,
      direcao: LeadInteracaoDirecao.ENTRADA,
      tipo: existing ? "RECAPTURA" : "CAPTURA",
      conteudo: data.dorPrincipal || "Lead captado.",
      metadados: {
        origem: data.origem,
        campanha: data.campanha,
        consentimento
      }
    }
  });
  return lead;
}

export async function findOrCreateWhatsappLead(input: {
  telefone: string;
  mensagem: string;
  messageId?: string | null;
}) {
  const telefone = normalizeLeadPhone(input.telefone);
  if (!telefone) throw new Error("Telefone de lead inválido.");
  const now = new Date();
  let lead = await prisma.plataformaLead.findFirst({
    where: { telefone },
    orderBy: { atualizadoEm: "desc" }
  });
  if (!lead) {
    lead = await prisma.plataformaLead.create({
      data: {
        telefone,
        canalOrigem: LeadComercialCanal.WHATSAPP,
        origem: "WhatsApp comercial",
        status: LeadComercialStatus.EM_CONVERSA,
        consentimento: true,
        consentimentoEm: now,
        ultimoContatoEm: now
      }
    });
  } else {
    lead = await prisma.plataformaLead.update({
      where: { id: lead.id },
      data: {
        ultimoContatoEm: now,
        consentimento: true,
        consentimentoEm: lead.consentimentoEm ?? now,
        optOutEm: null,
        ...(lead.status === LeadComercialStatus.OPT_OUT
          ? { status: LeadComercialStatus.EM_CONVERSA }
          : {})
      }
    });
  }

  try {
    await prisma.plataformaLeadInteracao.create({
      data: {
        leadId: lead.id,
        canal: LeadComercialCanal.WHATSAPP,
        direcao: LeadInteracaoDirecao.ENTRADA,
        conteudo: input.mensagem.slice(0, 4000),
        externalMessageId: text(input.messageId, 180)
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { lead, duplicate: true };
    }
    throw error;
  }
  return { lead, duplicate: false };
}

export async function recordCommercialInteraction(input: {
  leadId: string;
  channel: LeadComercialCanal;
  direction: LeadInteracaoDirecao;
  content: string;
  type?: string;
  userId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.plataformaLeadInteracao.create({
    data: {
      leadId: input.leadId,
      canal: input.channel,
      direcao: input.direction,
      tipo: input.type ?? "MENSAGEM",
      conteudo: input.content.slice(0, 8000),
      usuarioId: input.userId ?? null,
      metadados: input.metadata
    }
  });
}

export async function markLeadOptOut(leadId: string) {
  const now = new Date();
  return prisma.plataformaLead.update({
    where: { id: leadId },
    data: {
      status: LeadComercialStatus.OPT_OUT,
      consentimento: false,
      optOutEm: now,
      proximoFollowupEm: null,
      precisaHumano: false
    }
  });
}

export async function markCommercialLeadTrial(input: {
  leadId?: string | null;
  tenantId: string;
  empresa: string;
  email: string;
}) {
  if (!input.leadId) return null;
  const lead = await prisma.plataformaLead.findUnique({ where: { id: input.leadId } });
  if (!lead || lead.status === LeadComercialStatus.OPT_OUT) return null;
  if (lead.email && lead.email.toLowerCase() !== input.email.toLowerCase()) return null;
  const updated = await prisma.plataformaLead.update({
    where: { id: lead.id },
    data: {
      status: LeadComercialStatus.TESTE,
      tenantConvertidoId: input.tenantId,
      empresa: lead.empresa ?? input.empresa,
      email: lead.email ?? input.email,
      score: Math.max(lead.score, 90),
      precisaHumano: false,
      proximoFollowupEm: null,
      ultimoContatoEm: new Date()
    }
  });
  await recordCommercialInteraction({
    leadId: updated.id,
    channel: updated.canalOrigem,
    direction: LeadInteracaoDirecao.INTERNA,
    type: "CONVERSAO_TESTE",
    content: "Lead criou a conta de teste do XERP.",
    metadata: { tenantId: input.tenantId }
  });
  return updated;
}

export async function markCommercialLeadSubscriber(tenantId: string) {
  const lead = await prisma.plataformaLead.findFirst({
    where: { tenantConvertidoId: tenantId },
    orderBy: { atualizadoEm: "desc" }
  });
  if (!lead) return null;
  const updated = await prisma.plataformaLead.update({
    where: { id: lead.id },
    data: {
      status: LeadComercialStatus.ASSINANTE,
      score: 100,
      precisaHumano: false,
      proximoFollowupEm: null,
      ultimoContatoEm: new Date()
    }
  });
  await recordCommercialInteraction({
    leadId: updated.id,
    channel: updated.canalOrigem,
    direction: LeadInteracaoDirecao.INTERNA,
    type: "CONVERSAO_ASSINANTE",
    content: "Pagamento confirmado: lead convertido em assinante.",
    metadata: { tenantId }
  });
  return updated;
}

export async function listCommercialLeads(filters?: {
  status?: string;
  search?: string;
  channel?: string;
}) {
  await requirePlatformAdmin();
  const status = STATUS_VALUES.has(filters?.status as LeadComercialStatus)
    ? (filters?.status as LeadComercialStatus)
    : undefined;
  const channel = CHANNEL_VALUES.has(filters?.channel as LeadComercialCanal)
    ? (filters?.channel as LeadComercialCanal)
    : undefined;
  const search = text(filters?.search, 120);
  return prisma.plataformaLead.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(channel ? { canalOrigem: channel } : {}),
      ...(search
        ? {
            OR: [
              { nome: { contains: search, mode: "insensitive" } },
              { empresa: { contains: search, mode: "insensitive" } },
              { telefone: { contains: search.replace(/\D/g, "") } },
              { email: { contains: search, mode: "insensitive" } }
            ]
          }
        : {})
    },
    orderBy: [{ precisaHumano: "desc" }, { atualizadoEm: "desc" }],
    take: 500,
    include: {
      interacoes: {
        orderBy: { criadoEm: "desc" },
        take: 1,
        select: { conteudo: true, criadoEm: true }
      }
    }
  });
}

export async function getCommercialLead(id: string) {
  await requirePlatformAdmin();
  const lead = await prisma.plataformaLead.findUnique({
    where: { id },
    include: {
      interacoes: {
        orderBy: { criadoEm: "desc" },
        take: 100
      }
    }
  });
  if (!lead) throw new Error("Lead não encontrado.");
  return { ...lead, interacoes: lead.interacoes.reverse() };
}

export async function getCommercialLeadMetrics() {
  await requirePlatformAdmin();
  const [total, grouped, human, followups] = await Promise.all([
    prisma.plataformaLead.count(),
    prisma.plataformaLead.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.plataformaLead.count({ where: { precisaHumano: true, status: { not: "OPT_OUT" } } }),
    prisma.plataformaLead.count({
      where: { proximoFollowupEm: { lte: new Date() }, status: { notIn: ["ASSINANTE", "PERDIDO", "OPT_OUT"] } }
    })
  ]);
  const byStatus = Object.fromEntries(grouped.map((item) => [item.status, item._count._all])) as Record<string, number>;
  return {
    total,
    novos: byStatus.NOVO ?? 0,
    emConversa: byStatus.EM_CONVERSA ?? 0,
    qualificados: byStatus.QUALIFICADO ?? 0,
    testes: byStatus.TESTE ?? 0,
    assinantes: byStatus.ASSINANTE ?? 0,
    precisaHumano: human,
    followupsPendentes: followups
  };
}

export async function updateCommercialLead(
  id: string,
  input: Record<string, unknown>
) {
  const session = await requirePlatformAdmin();
  const supplied = (field: string) => Object.prototype.hasOwnProperty.call(input, field);
  const status = STATUS_VALUES.has(input.status as LeadComercialStatus)
    ? (input.status as LeadComercialStatus)
    : undefined;
  const score = Number(input.score);
  const nextFollowup = text(input.proximoFollowupEm, 40);
  const lead = await prisma.plataformaLead.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(supplied("nome") ? { nome: text(input.nome) } : {}),
      ...(supplied("empresa") ? { empresa: text(input.empresa) } : {}),
      ...(supplied("telefone") ? { telefone: normalizeLeadPhone(input.telefone) } : {}),
      ...(supplied("email") ? { email: normalizeEmail(input.email) } : {}),
      ...(supplied("segmento") ? { segmento: text(input.segmento) } : {}),
      ...(supplied("dorPrincipal") ? { dorPrincipal: text(input.dorPrincipal, 1200) } : {}),
      ...(supplied("observacoes") ? { observacoes: text(input.observacoes, 4000) } : {}),
      ...(supplied("precisaHumano") ? { precisaHumano: input.precisaHumano === true } : {}),
      ...(supplied("score") && Number.isFinite(score)
        ? { score: Math.max(0, Math.min(100, Math.round(score))) }
        : {}),
      ...(nextFollowup ? { proximoFollowupEm: new Date(nextFollowup) } : input.proximoFollowupEm === null ? { proximoFollowupEm: null } : {})
    }
  });
  await recordCommercialInteraction({
    leadId: lead.id,
    channel: lead.canalOrigem,
    direction: LeadInteracaoDirecao.INTERNA,
    type: "ATUALIZACAO",
    userId: session.usuarioId,
    content: `Lead atualizado para ${lead.status}.`,
    metadata: { status: lead.status, score: lead.score, precisaHumano: lead.precisaHumano }
  });
  return lead;
}

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { decryptSecret, encryptSecret, secretLastChars } from "@/lib/security/secret-crypto";

export type CommercialAgentRuntimeConfig = {
  ativo: boolean;
  nomeAgente: string;
  numeroWhatsapp: string | null;
  whatsappInstanceId: string | null;
  whatsappToken: string | null;
  whatsappClientToken: string | null;
  webhookSecret: string | null;
  openrouterApiKey: string | null;
  modeloIa: string;
  telefoneHumano: string | null;
  urlCadastro: string;
  precoMensal: number;
  promptComplementar: string | null;
};

function digits(value: unknown, max = 13): string | null {
  const normalized = typeof value === "string" ? value.replace(/\D/g, "").slice(0, max) : "";
  return normalized || null;
}

function clean(value: unknown, max = 300): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? normalized.slice(0, max) : null;
}

function decryptOptional(value: string | null): string | null {
  return value ? decryptSecret(value) : null;
}

export async function getCommercialAgentRuntime(): Promise<CommercialAgentRuntimeConfig | null> {
  const config = await prisma.plataformaAgenteComercial.findUnique({ where: { id: "default" } });
  if (!config) return null;
  return {
    ativo: config.ativo,
    nomeAgente: config.nomeAgente,
    numeroWhatsapp: config.numeroWhatsapp,
    whatsappInstanceId: config.whatsappInstanceId,
    whatsappToken: decryptOptional(config.whatsappTokenCripto),
    whatsappClientToken: decryptOptional(config.whatsappClientTokenCripto),
    webhookSecret: decryptOptional(config.webhookSecretCripto),
    openrouterApiKey: decryptOptional(config.openrouterApiKeyCripto),
    modeloIa: config.modeloIa,
    telefoneHumano: config.telefoneHumano,
    urlCadastro: config.urlCadastro,
    precoMensal: Number(config.precoMensal),
    promptComplementar: config.promptComplementar
  };
}

export async function getCommercialAgentConfigSummary(baseUrl?: string | null) {
  await requirePlatformAdmin();
  const config = await prisma.plataformaAgenteComercial.findUnique({ where: { id: "default" } });
  const secret = config?.webhookSecretCripto ? decryptSecret(config.webhookSecretCripto) : null;
  return {
    ativo: config?.ativo ?? false,
    nomeAgente: config?.nomeAgente ?? "Especialista XERP",
    numeroWhatsapp: config?.numeroWhatsapp ?? "",
    whatsappInstanceId: config?.whatsappInstanceId ?? "",
    temWhatsappToken: Boolean(config?.whatsappTokenCripto),
    temWhatsappClientToken: Boolean(config?.whatsappClientTokenCripto),
    temOpenrouterKey: Boolean(config?.openrouterApiKeyCripto),
    openrouterKeyFinal: config?.openrouterKeyFinal ?? null,
    modeloIa: config?.modeloIa ?? "openai/gpt-4o-mini",
    telefoneHumano: config?.telefoneHumano ?? "",
    urlCadastro: config?.urlCadastro ?? "/cadastro?plano=chat",
    precoMensal: config ? Number(config.precoMensal) : 97,
    promptComplementar: config?.promptComplementar ?? "",
    webhookUrl: secret && baseUrl
      ? `${baseUrl.replace(/\/+$/, "")}/api/webhooks/comercial/whatsapp/${secret}`
      : null
  };
}

export async function saveCommercialAgentConfig(input: Record<string, unknown>) {
  await requirePlatformAdmin();
  const existing = await prisma.plataformaAgenteComercial.findUnique({ where: { id: "default" } });
  const whatsappToken = clean(input.whatsappToken, 500);
  const whatsappClientToken = clean(input.whatsappClientToken, 500);
  const openrouterApiKey = clean(input.openrouterApiKey, 500);
  const currentWebhookSecret = existing?.webhookSecretCripto
    ? decryptSecret(existing.webhookSecretCripto)
    : null;
  const webhookSecret = input.regenerarWebhook === true || !currentWebhookSecret
    ? randomBytes(24).toString("hex")
    : currentWebhookSecret;
  const price = Number(input.precoMensal);
  const model = clean(input.modeloIa, 160) ?? "openai/gpt-4o-mini";
  const instanceId = clean(input.whatsappInstanceId, 180);

  if (input.ativo === true && (!instanceId || (!whatsappToken && !existing?.whatsappTokenCripto))) {
    throw new Error("Informe a instância e o token do WhatsApp antes de ativar o agente.");
  }
  if (input.ativo === true && !openrouterApiKey && !existing?.openrouterApiKeyCripto) {
    throw new Error("Informe a chave da OpenRouter antes de ativar o agente.");
  }

  return prisma.plataformaAgenteComercial.upsert({
    where: { id: "default" },
    update: {
      ativo: input.ativo === true,
      nomeAgente: clean(input.nomeAgente, 100) ?? "Especialista XERP",
      numeroWhatsapp: digits(input.numeroWhatsapp),
      whatsappInstanceId: instanceId,
      whatsappClientTokenCripto: whatsappClientToken
        ? encryptSecret(whatsappClientToken)
        : existing?.whatsappClientTokenCripto,
      whatsappTokenCripto: whatsappToken
        ? encryptSecret(whatsappToken)
        : existing?.whatsappTokenCripto,
      openrouterApiKeyCripto: openrouterApiKey
        ? encryptSecret(openrouterApiKey)
        : existing?.openrouterApiKeyCripto,
      openrouterKeyFinal: openrouterApiKey
        ? secretLastChars(openrouterApiKey)
        : existing?.openrouterKeyFinal,
      webhookSecretCripto: encryptSecret(webhookSecret),
      modeloIa: model,
      telefoneHumano: digits(input.telefoneHumano),
      urlCadastro: clean(input.urlCadastro, 500) ?? "/cadastro?plano=chat",
      precoMensal: Number.isFinite(price) && price >= 0 ? price : 97,
      promptComplementar: clean(input.promptComplementar, 8000)
    },
    create: {
      id: "default",
      ativo: input.ativo === true,
      nomeAgente: clean(input.nomeAgente, 100) ?? "Especialista XERP",
      numeroWhatsapp: digits(input.numeroWhatsapp),
      whatsappInstanceId: instanceId,
      whatsappTokenCripto: whatsappToken ? encryptSecret(whatsappToken) : null,
      whatsappClientTokenCripto: whatsappClientToken ? encryptSecret(whatsappClientToken) : null,
      webhookSecretCripto: encryptSecret(webhookSecret),
      openrouterApiKeyCripto: openrouterApiKey ? encryptSecret(openrouterApiKey) : null,
      openrouterKeyFinal: openrouterApiKey ? secretLastChars(openrouterApiKey) : null,
      modeloIa: model,
      telefoneHumano: digits(input.telefoneHumano),
      urlCadastro: clean(input.urlCadastro, 500) ?? "/cadastro?plano=chat",
      precoMensal: Number.isFinite(price) && price >= 0 ? price : 97,
      promptComplementar: clean(input.promptComplementar, 8000)
    }
  });
}

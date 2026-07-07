import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { encryptSecret } from "@/lib/security/secret-crypto";
import { salvarAsaasConfig, getAsaasRuntime, asaasRegistrarWebhook } from "@/lib/asaas/asaas-service";

/**
 * Config de PLATAFORMA do módulo de crédito (dono do SaaS): credenciais do Asaas (cobrança das
 * recargas) + ApiBrasil (bureau, conta mestre) + preços de revenda. Segredos nunca voltam ao front
 * — só flags de "configurado". Toda função exige requirePlatformAdmin().
 */

export type CreditoPlataformaAdmin = {
  asaasConfigurado: boolean;
  asaasSandbox: boolean;
  asaasWalletId: string | null;
  temWebhook: boolean;
  apibrasilConfigurado: boolean;
  apibrasilSandbox: boolean;
  apibrasilDevicePF: string | null;
  apibrasilDevicePJ: string | null;
  precoConsultaPF: number;
  precoConsultaPJ: number;
  validadeConsultaDias: number;
};

export async function getCreditoPlataformaAdmin(): Promise<CreditoPlataformaAdmin> {
  await requirePlatformAdmin();
  const cfg = await prisma.plataformaCredito.findUnique({ where: { id: "default" } });
  return {
    asaasConfigurado: Boolean(cfg?.asaasApiKeyCripto),
    asaasSandbox: cfg?.asaasSandbox ?? true,
    asaasWalletId: cfg?.asaasWalletId ?? null,
    temWebhook: Boolean(cfg?.asaasWebhookToken),
    apibrasilConfigurado: Boolean(cfg?.apibrasilTokenCripto),
    apibrasilSandbox: cfg?.apibrasilSandbox ?? true,
    apibrasilDevicePF: cfg?.apibrasilDevicePF ?? null,
    apibrasilDevicePJ: cfg?.apibrasilDevicePJ ?? null,
    precoConsultaPF: cfg ? Number(cfg.precoConsultaPF) : 0,
    precoConsultaPJ: cfg ? Number(cfg.precoConsultaPJ) : 0,
    validadeConsultaDias: cfg?.validadeConsultaDias ?? 60
  };
}

export async function salvarCreditoPlataformaAdmin(input: {
  asaasApiKey?: string;
  asaasWalletId?: string;
  asaasSandbox?: boolean;
  apibrasilToken?: string;
  apibrasilDevicePF?: string;
  apibrasilDevicePJ?: string;
  apibrasilSandbox?: boolean;
  precoConsultaPF?: number;
  precoConsultaPJ?: number;
  validadeConsultaDias?: number;
}): Promise<CreditoPlataformaAdmin> {
  await requirePlatformAdmin();
  const atual = await prisma.plataformaCredito.findUnique({ where: { id: "default" } });
  const webhookToken = atual?.asaasWebhookToken ?? randomBytes(24).toString("hex");

  // Asaas (chave criptografada; vazio = mantém a atual).
  if (input.asaasApiKey !== undefined || input.asaasWalletId !== undefined || input.asaasSandbox !== undefined) {
    await salvarAsaasConfig({
      apiKey: input.asaasApiKey?.trim() || null,
      walletId: input.asaasWalletId ?? atual?.asaasWalletId ?? null,
      sandbox: input.asaasSandbox ?? atual?.asaasSandbox ?? true,
      webhookToken
    });
  }

  // ApiBrasil + preços + validade (upsert direto).
  await prisma.plataformaCredito.upsert({
    where: { id: "default" },
    update: {
      ...(input.apibrasilToken?.trim() ? { apibrasilTokenCripto: encryptSecret(input.apibrasilToken.trim()) } : {}),
      ...(input.apibrasilDevicePF !== undefined ? { apibrasilDevicePF: input.apibrasilDevicePF || null } : {}),
      ...(input.apibrasilDevicePJ !== undefined ? { apibrasilDevicePJ: input.apibrasilDevicePJ || null } : {}),
      ...(input.apibrasilSandbox !== undefined ? { apibrasilSandbox: input.apibrasilSandbox } : {}),
      ...(input.precoConsultaPF !== undefined ? { precoConsultaPF: input.precoConsultaPF } : {}),
      ...(input.precoConsultaPJ !== undefined ? { precoConsultaPJ: input.precoConsultaPJ } : {}),
      ...(input.validadeConsultaDias !== undefined ? { validadeConsultaDias: input.validadeConsultaDias } : {})
    },
    create: {
      id: "default",
      asaasWebhookToken: webhookToken,
      apibrasilTokenCripto: input.apibrasilToken?.trim() ? encryptSecret(input.apibrasilToken.trim()) : null,
      apibrasilDevicePF: input.apibrasilDevicePF || null,
      apibrasilDevicePJ: input.apibrasilDevicePJ || null,
      apibrasilSandbox: input.apibrasilSandbox ?? true,
      precoConsultaPF: input.precoConsultaPF ?? 0,
      precoConsultaPJ: input.precoConsultaPJ ?? 0,
      validadeConsultaDias: input.validadeConsultaDias ?? 60
    }
  });

  return getCreditoPlataformaAdmin();
}

/** Registra o webhook de recarga no Asaas usando a URL pública informada. */
export async function registrarWebhookAsaasAdmin(baseUrl: string, email: string): Promise<string> {
  await requirePlatformAdmin();
  const rt = await getAsaasRuntime();
  if (!rt) throw new Error("Configure a chave do Asaas primeiro.");
  const cfg = await prisma.plataformaCredito.findUnique({ where: { id: "default" }, select: { asaasWebhookToken: true } });
  const token = cfg?.asaasWebhookToken ?? randomBytes(24).toString("hex");
  if (!cfg?.asaasWebhookToken) {
    await prisma.plataformaCredito.update({ where: { id: "default" }, data: { asaasWebhookToken: token } });
  }
  const base = baseUrl.replace(/\/+$/, "");
  const url = `${base}/api/webhooks/asaas/${token}`;
  await asaasRegistrarWebhook(rt, url, token, email);
  return url;
}

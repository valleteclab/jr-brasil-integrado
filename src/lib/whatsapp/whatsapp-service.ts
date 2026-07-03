import type { ProvedorWhatsapp } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { decryptSecret, encryptSecret } from "@/lib/security/secret-crypto";
import { assertModuloLiberado } from "@/lib/auth/tenant-features";
import { sendZapiDocument, sendZapiText } from "./zapi-client";
import {
  zernioAbrirConversaComTemplate,
  zernioEnviarMensagemLivre,
  type ZernioCredentials
} from "./zernio-client";

/**
 * Serviço de WHATSAPP com provedor plugável por empresa (ConfiguracaoWhatsapp.provedor):
 *  - ZAPI:   não oficial (WhatsApp Web) — texto e documento livres, sem template.
 *  - ZERNIO: API OFICIAL da Meta (WABA) via Zernio — conversa iniciada pela empresa exige
 *    TEMPLATE aprovado; texto vai como parâmetro do template e o PDF só entra na janela de
 *    24h (após o cliente responder). Quando o PDF não puder ir, o envio reporta `aviso`.
 * Quem envia mensagem importa DESTE serviço — nunca dos clientes zapi/zernio diretamente.
 */

export type WhatsappConfig = {
  ativo: boolean;
  atenderClientes: boolean;
  provedor: ProvedorWhatsapp;
  /** Z-API (segredos descriptografados). */
  instanceId: string | null;
  token: string | null;
  clientToken: string | null;
  /** Zernio. A API key reaproveita o campo tokenCripto (por provedor um segredo). */
  zernioAccountId: string | null;
  zernioTemplateNome: string | null;
  zernioTemplateIdioma: string | null;
};

export type WhatsappSendResult = { ok: boolean; error?: string; aviso?: string };

/** Config efetiva (com segredos descriptografados) para uso server-side. */
export async function getWhatsappRuntime(scope: TenantScope): Promise<WhatsappConfig | null> {
  const cfg = await prisma.configuracaoWhatsapp.findUnique({ where: { empresaId: scope.empresaId } });
  if (!cfg) return null;
  return {
    ativo: cfg.ativo,
    atenderClientes: cfg.atenderClientes,
    provedor: cfg.provedor,
    instanceId: cfg.instanceId,
    token: cfg.tokenCripto ? decryptSecret(cfg.tokenCripto) : null,
    clientToken: cfg.clientTokenCripto ? decryptSecret(cfg.clientTokenCripto) : null,
    zernioAccountId: cfg.zernioAccountId,
    zernioTemplateNome: cfg.zernioTemplateNome,
    zernioTemplateIdioma: cfg.zernioTemplateIdioma
  };
}

export type SaveWhatsappInput = {
  ativo: boolean;
  provedor?: ProvedorWhatsapp;
  atenderClientes: boolean;
  /** Z-API. */
  instanceId?: string;
  token?: string;
  clientToken?: string;
  /** Zernio: API key (sk_...) — gravada em tokenCripto; vazia mantém a atual. */
  zernioApiKey?: string;
  zernioAccountId?: string;
  zernioTemplateNome?: string;
  zernioTemplateIdioma?: string;
};

/** Salva a config do WhatsApp criptografando os segredos informados (vazio = mantém). */
export async function saveWhatsappConfig(scope: TenantScope, input: SaveWhatsappInput) {
  await assertModuloLiberado(scope, "whatsappHabilitado");
  const provedor: ProvedorWhatsapp = input.provedor === "ZERNIO" ? "ZERNIO" : "ZAPI";
  // O segredo principal (tokenCripto) é o token da Z-API OU a API key da Zernio, conforme o provedor.
  const segredo = provedor === "ZERNIO" ? input.zernioApiKey : input.token;
  const tokenData = segredo?.trim() ? { tokenCripto: encryptSecret(segredo.trim()) } : {};
  const clientData = input.clientToken?.trim() ? { clientTokenCripto: encryptSecret(input.clientToken.trim()) } : {};
  const zernioData = {
    zernioAccountId: input.zernioAccountId?.trim() || null,
    zernioTemplateNome: input.zernioTemplateNome?.trim() || null,
    zernioTemplateIdioma: input.zernioTemplateIdioma?.trim() || null
  };
  return prisma.configuracaoWhatsapp.upsert({
    where: { empresaId: scope.empresaId },
    update: {
      provedor,
      ativo: input.ativo,
      instanceId: input.instanceId?.trim() || null,
      atenderClientes: input.atenderClientes,
      ...zernioData,
      ...tokenData,
      ...clientData
    },
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      provedor,
      ativo: input.ativo,
      instanceId: input.instanceId?.trim() || null,
      atenderClientes: input.atenderClientes,
      ...zernioData,
      tokenCripto: segredo?.trim() ? encryptSecret(segredo.trim()) : null,
      clientTokenCripto: input.clientToken?.trim() ? encryptSecret(input.clientToken.trim()) : null
    }
  });
}

function credenciaisZernio(config: WhatsappConfig): ZernioCredentials | null {
  if (!config.token || !config.zernioAccountId) return null;
  return {
    apiKey: config.token,
    accountId: config.zernioAccountId,
    templateNome: config.zernioTemplateNome,
    templateIdioma: config.zernioTemplateIdioma
  };
}

/** Envia texto pelo provedor configurado. Na Zernio, o texto vai como parâmetro do template. */
export async function sendWhatsappText(
  config: WhatsappConfig | null,
  phone: string,
  message: string
): Promise<WhatsappSendResult> {
  if (!config) return { ok: false, error: "WhatsApp não configurado." };
  if (config.provedor === "ZERNIO") {
    const cred = credenciaisZernio(config);
    if (!cred) return { ok: false, error: "Zernio não configurada (API key e conta WhatsApp)." };
    const r = await zernioAbrirConversaComTemplate(cred, phone, [message]);
    return { ok: r.ok, error: r.error };
  }
  return sendZapiText(config, phone, message);
}

/**
 * Envia documento PDF (com legenda) pelo provedor configurado.
 * Zernio (API oficial): a legenda vai no TEMPLATE (sempre entregue); o PDF é tentado na
 * conversa em seguida — fora da janela de 24h a Meta rejeita, e o resultado volta ok com
 * `aviso` (o cliente recebeu as informações; o PDF pode ser reenviado quando ele responder).
 */
export async function sendWhatsappDocument(
  config: WhatsappConfig | null,
  phone: string,
  doc: { base64: string; fileName: string; caption?: string }
): Promise<WhatsappSendResult> {
  if (!config) return { ok: false, error: "WhatsApp não configurado." };
  if (config.provedor === "ZERNIO") {
    const cred = credenciaisZernio(config);
    if (!cred) return { ok: false, error: "Zernio não configurada (API key e conta WhatsApp)." };
    const abertura = await zernioAbrirConversaComTemplate(cred, phone, [doc.caption || doc.fileName]);
    if (!abertura.ok) return { ok: false, error: abertura.error };
    const avisoPdf =
      "Mensagem entregue via template (API oficial). O PDF só pode ser enviado depois que o cliente responder (janela de 24h da Meta) — reenvie quando isso acontecer.";
    if (!abertura.conversationId) {
      return { ok: true, aviso: avisoPdf };
    }
    const envioPdf = await zernioEnviarMensagemLivre(cred, abertura.conversationId, {
      pdf: { buffer: Buffer.from(doc.base64, "base64"), fileName: doc.fileName }
    });
    if (!envioPdf.ok) {
      return { ok: true, aviso: `${avisoPdf}${envioPdf.error ? ` (retorno: ${envioPdf.error})` : ""}` };
    }
    return { ok: true };
  }
  return sendZapiDocument(config, phone, { base64: doc.base64, fileName: doc.fileName, caption: doc.caption });
}

import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { decryptSecret, encryptSecret } from "@/lib/security/secret-crypto";
import { assertModuloLiberado } from "@/lib/auth/tenant-features";

/**
 * Cliente da Z-API (https://www.z-api.io). Credenciais (instanceId, token e
 * client-token) ficam criptografadas em ConfiguracaoWhatsapp por empresa.
 * Nunca logar credenciais.
 */

export type ZapiConfig = {
  ativo: boolean;
  instanceId: string | null;
  token: string | null;
  clientToken: string | null;
  atenderClientes: boolean;
};

/** Config efetiva (com segredos descriptografados) para uso server-side. */
export async function getWhatsappRuntime(scope: TenantScope): Promise<ZapiConfig | null> {
  const cfg = await prisma.configuracaoWhatsapp.findUnique({ where: { empresaId: scope.empresaId } });
  if (!cfg) return null;
  return {
    ativo: cfg.ativo,
    instanceId: cfg.instanceId,
    token: cfg.tokenCripto ? decryptSecret(cfg.tokenCripto) : null,
    clientToken: cfg.clientTokenCripto ? decryptSecret(cfg.clientTokenCripto) : null,
    atenderClientes: cfg.atenderClientes
  };
}

export type SaveWhatsappInput = {
  ativo: boolean;
  instanceId?: string;
  token?: string;
  clientToken?: string;
  atenderClientes: boolean;
};

/** Salva a config Z-API criptografando token e client-token quando informados. */
export async function saveWhatsappConfig(scope: TenantScope, input: SaveWhatsappInput) {
  await assertModuloLiberado(scope, "whatsappHabilitado");
  const tokenData = input.token?.trim() ? { tokenCripto: encryptSecret(input.token.trim()) } : {};
  const clientData = input.clientToken?.trim() ? { clientTokenCripto: encryptSecret(input.clientToken.trim()) } : {};
  return prisma.configuracaoWhatsapp.upsert({
    where: { empresaId: scope.empresaId },
    update: {
      ativo: input.ativo,
      instanceId: input.instanceId?.trim() || null,
      atenderClientes: input.atenderClientes,
      ...tokenData,
      ...clientData
    },
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      provedor: "ZAPI",
      ativo: input.ativo,
      instanceId: input.instanceId?.trim() || null,
      atenderClientes: input.atenderClientes,
      tokenCripto: input.token?.trim() ? encryptSecret(input.token.trim()) : null,
      clientTokenCripto: input.clientToken?.trim() ? encryptSecret(input.clientToken.trim()) : null
    }
  });
}

/**
 * Envia um DOCUMENTO (ex.: PDF de boleto/DANFE) via Z-API. O arquivo vai em base64 (data URL) —
 * não precisa de URL pública. `extension` define o endpoint (send-document/{extension}).
 * Retorna ok/erro sem lançar.
 */
export async function sendWhatsappDocument(
  config: ZapiConfig,
  phone: string,
  doc: { base64: string; fileName: string; extension?: string; caption?: string; mimeType?: string }
): Promise<{ ok: boolean; error?: string }> {
  if (!config.instanceId || !config.token) {
    return { ok: false, error: "WhatsApp (Z-API) não configurado." };
  }
  const extension = (doc.extension ?? "pdf").replace(/[^a-z0-9]/gi, "").toLowerCase() || "pdf";
  const mime = doc.mimeType ?? (extension === "pdf" ? "application/pdf" : `application/${extension}`);
  const url = `https://api.z-api.io/instances/${config.instanceId}/token/${config.token}/send-document/${extension}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.clientToken ? { "Client-Token": config.clientToken } : {})
      },
      body: JSON.stringify({
        phone: phone.replace(/\D/g, ""),
        document: `data:${mime};base64,${doc.base64}`,
        fileName: doc.fileName,
        ...(doc.caption ? { caption: doc.caption } : {})
      })
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      return { ok: false, error: `Z-API HTTP ${res.status}${raw ? ` ${raw.slice(0, 160)}` : ""}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha de rede ao enviar WhatsApp." };
  }
}

/** Envia uma mensagem de texto via Z-API. Retorna ok/erro sem lançar. */
export async function sendWhatsappText(
  config: ZapiConfig,
  phone: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  if (!config.instanceId || !config.token) {
    return { ok: false, error: "WhatsApp (Z-API) não configurado." };
  }
  const url = `https://api.z-api.io/instances/${config.instanceId}/token/${config.token}/send-text`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.clientToken ? { "Client-Token": config.clientToken } : {})
      },
      body: JSON.stringify({ phone: phone.replace(/\D/g, ""), message })
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      return { ok: false, error: `Z-API HTTP ${res.status}${raw ? ` ${raw.slice(0, 160)}` : ""}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha de rede ao enviar WhatsApp." };
  }
}

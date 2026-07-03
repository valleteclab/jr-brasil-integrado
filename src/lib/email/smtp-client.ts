import nodemailer from "nodemailer";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { decryptSecret, encryptSecret } from "@/lib/security/secret-crypto";

/**
 * Cliente de E-MAIL (SMTP) por empresa. Credenciais ficam criptografadas em
 * ConfiguracaoEmail (mesmo padrão da ConfiguracaoWhatsapp). Nunca logar credenciais.
 * Funciona com qualquer provedor SMTP (Gmail, Hostinger, SES, Locaweb...).
 */

export type EmailConfig = {
  ativo: boolean;
  host: string | null;
  porta: number;
  seguro: boolean;
  usuario: string | null;
  senha: string | null;
  remetenteNome: string | null;
  remetenteEmail: string | null;
};

/** Config efetiva (com a senha descriptografada) para uso server-side. */
export async function getEmailRuntime(scope: TenantScope): Promise<EmailConfig | null> {
  const cfg = await prisma.configuracaoEmail.findUnique({ where: { empresaId: scope.empresaId } });
  if (!cfg) return null;
  return {
    ativo: cfg.ativo,
    host: cfg.host,
    porta: cfg.porta,
    seguro: cfg.seguro,
    usuario: cfg.usuario,
    senha: cfg.senhaCripto ? decryptSecret(cfg.senhaCripto) : null,
    remetenteNome: cfg.remetenteNome,
    remetenteEmail: cfg.remetenteEmail
  };
}

export type SaveEmailInput = {
  ativo: boolean;
  host?: string;
  porta?: number;
  seguro?: boolean;
  usuario?: string;
  senha?: string;
  remetenteNome?: string;
  remetenteEmail?: string;
};

/** Salva a config SMTP criptografando a senha quando informada (vazia = mantém a atual). */
export async function saveEmailConfig(scope: TenantScope, input: SaveEmailInput) {
  const porta = Number(input.porta) > 0 ? Math.floor(Number(input.porta)) : 587;
  const senhaData = input.senha?.trim() ? { senhaCripto: encryptSecret(input.senha.trim()) } : {};
  return prisma.configuracaoEmail.upsert({
    where: { empresaId: scope.empresaId },
    update: {
      ativo: input.ativo,
      host: input.host?.trim() || null,
      porta,
      seguro: Boolean(input.seguro),
      usuario: input.usuario?.trim() || null,
      remetenteNome: input.remetenteNome?.trim() || null,
      remetenteEmail: input.remetenteEmail?.trim() || null,
      ...senhaData
    },
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      ativo: input.ativo,
      host: input.host?.trim() || null,
      porta,
      seguro: Boolean(input.seguro),
      usuario: input.usuario?.trim() || null,
      senhaCripto: input.senha?.trim() ? encryptSecret(input.senha.trim()) : null,
      remetenteNome: input.remetenteNome?.trim() || null,
      remetenteEmail: input.remetenteEmail?.trim() || null
    }
  });
}

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

/** Envia um e-mail via SMTP da empresa. Retorna ok/erro sem lançar (padrão do zapi-client). */
export async function sendEmail(
  config: EmailConfig,
  params: { to: string; subject: string; html: string; attachments?: EmailAttachment[] }
): Promise<{ ok: boolean; error?: string }> {
  if (!config.ativo) {
    return { ok: false, error: "Envio de e-mail desativado nas configurações." };
  }
  if (!config.host || !config.usuario || !config.senha) {
    return { ok: false, error: "E-mail (SMTP) não configurado. Configure em Configurações → E-mail." };
  }
  const from = config.remetenteEmail || config.usuario;
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.porta,
      secure: config.seguro,
      auth: { user: config.usuario, pass: config.senha }
    });
    await transporter.sendMail({
      from: config.remetenteNome ? `"${config.remetenteNome.replace(/"/g, "'")}" <${from}>` : from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      attachments: params.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType
      }))
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha ao enviar o e-mail." };
  }
}

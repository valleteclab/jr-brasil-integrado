import { createHash, randomInt } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { getWhatsappRuntime, sendWhatsappText } from "@/lib/whatsapp/whatsapp-service";

/**
 * 2FA DE LOGIN por WhatsApp: código de 6 dígitos com validade curta, guardado só como HASH.
 * Ativação por empresa (Empresa.exigir2fa, controlada pelo dono do SaaS no /admin); o código vai
 * para o WhatsApp cadastrado no usuário, pela config de WhatsApp da própria empresa.
 */

export class TwoFactorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TwoFactorError";
  }
}

const VALIDADE_MIN = 5;
const MAX_TENTATIVAS = 5;

const hashCodigo = (codigo: string) => createHash("sha256").update(`2fa:${codigo}`).digest("hex");

/** Mascara o WhatsApp para exibir na tela de login (só os 4 últimos dígitos). */
export function mascararWhatsapp(numero: string): string {
  const d = numero.replace(/\D+/g, "");
  return d.length >= 4 ? `•••• ${d.slice(-4)}` : "••••";
}

/** Gera o desafio, grava o hash e envia o código pelo WhatsApp da empresa. */
export async function iniciarDesafio2fa(
  usuario: { id: string; nome: string; whatsapp: string },
  scope: TenantScope
): Promise<{ desafioId: string }> {
  const config = await getWhatsappRuntime(scope);
  if (!config?.ativo) {
    throw new TwoFactorError("2FA ativo, mas o WhatsApp da empresa não está configurado (Configurações → WhatsApp).");
  }

  const codigo = String(randomInt(0, 1000000)).padStart(6, "0");
  const desafio = await prisma.desafio2fa.create({
    data: {
      usuarioId: usuario.id,
      codigoHash: hashCodigo(codigo),
      expiraEm: new Date(Date.now() + VALIDADE_MIN * 60 * 1000)
    }
  });

  const envio = await sendWhatsappText(
    config,
    usuario.whatsapp,
    `Seu código de acesso ao ERP é *${codigo}*. Vale por ${VALIDADE_MIN} minutos. Se não foi você, ignore esta mensagem.`
  );
  if (!envio.ok) {
    await prisma.desafio2fa.delete({ where: { id: desafio.id } }).catch(() => undefined);
    throw new TwoFactorError(`Não foi possível enviar o código por WhatsApp: ${envio.error ?? "falha no envio"}.`);
  }

  return { desafioId: desafio.id };
}

/** Verifica o código: single-use, expira em 5 min, no máximo 5 tentativas. Devolve o usuário. */
export async function verificarDesafio2fa(desafioId: string, codigo: string): Promise<{ usuarioId: string }> {
  const desafio = await prisma.desafio2fa.findUnique({ where: { id: desafioId } });
  if (!desafio || desafio.usadoEm) throw new TwoFactorError("Código inválido ou já utilizado. Faça login novamente.");
  if (desafio.expiraEm < new Date()) throw new TwoFactorError("Código expirado. Faça login novamente.");
  if (desafio.tentativas >= MAX_TENTATIVAS) throw new TwoFactorError("Muitas tentativas. Faça login novamente.");

  const informado = (codigo ?? "").replace(/\D+/g, "");
  if (informado.length !== 6 || hashCodigo(informado) !== desafio.codigoHash) {
    await prisma.desafio2fa.update({ where: { id: desafioId }, data: { tentativas: { increment: 1 } } });
    throw new TwoFactorError("Código incorreto.");
  }

  // Single-use atômico: só passa quem marcar o usadoEm primeiro (corrida entre duas requisições).
  const marcado = await prisma.desafio2fa.updateMany({
    where: { id: desafioId, usadoEm: null },
    data: { usadoEm: new Date() }
  });
  if (marcado.count === 0) throw new TwoFactorError("Código inválido ou já utilizado. Faça login novamente.");

  return { usuarioId: desafio.usuarioId };
}

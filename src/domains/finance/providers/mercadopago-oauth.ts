import { prisma } from "@/lib/db/prisma";
import { decryptSecret, encryptSecret } from "@/lib/security/secret-crypto";
import { BankError } from "./bank-provider";

/**
 * OAuth do MERCADO PAGO (modelo marketplace): a aplicação (client_id/secret) é da PLATAFORMA
 * (PlataformaConfiguracao — configurada em /admin/pagamentos); cada cliente conecta a PRÓPRIA
 * conta MP com um clique e os tokens ficam criptografados na ContaBancaria.
 * Tokens valem ~6 meses; `garantirMpAccessToken` renova pelo refresh_token quando faltar <15 dias.
 */

const AUTH_URL = "https://auth.mercadopago.com.br/authorization";
const TOKEN_URL = "https://api.mercadopago.com/oauth/token";
/** Renova o token quando faltar menos que isso para expirar. */
const MARGEM_RENOVACAO_MS = 15 * 86400000;

export type MpAppCreds = { clientId: string; clientSecret: string };

export async function getMpAppCreds(): Promise<MpAppCreds | null> {
  const cfg = await prisma.plataformaConfiguracao.findUnique({ where: { id: "default" } });
  if (!cfg?.mpClientId || !cfg.mpClientSecretCripto) return null;
  return { clientId: cfg.mpClientId, clientSecret: decryptSecret(cfg.mpClientSecretCripto) };
}

export async function salvarMpAppCreds(input: { clientId: string; clientSecret?: string | null }): Promise<void> {
  const data: { mpClientId: string; mpClientSecretCripto?: string } = { mpClientId: input.clientId.trim() };
  if (input.clientSecret?.trim()) data.mpClientSecretCripto = encryptSecret(input.clientSecret.trim());
  await prisma.plataformaConfiguracao.upsert({
    where: { id: "default" },
    update: data,
    create: { id: "default", ...data }
  });
}

/** URL de autorização para o cliente conectar a conta MP (state carrega a conta, criptografado). */
export function montarUrlAutorizacao(creds: MpAppCreds, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: creds.clientId,
    response_type: "code",
    platform_id: "mp",
    state,
    redirect_uri: redirectUri
  });
  return `${AUTH_URL}?${q.toString()}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  user_id?: number;
  public_key?: string;
  expires_in?: number; // segundos
  live_mode?: boolean;
  message?: string;
  error?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !data.access_token) {
    throw new BankError(`Mercado Pago OAuth: ${data.message || data.error || `HTTP ${res.status}`}`);
  }
  return data;
}

/** Troca o code do callback pelos tokens e grava (criptografados) na conta bancária. */
export async function conectarContaMp(contaId: string, code: string, redirectUri: string): Promise<{ userId: string | null }> {
  const creds = await getMpAppCreds();
  if (!creds) throw new BankError("Aplicação Mercado Pago não configurada na plataforma (/admin/pagamentos).");
  const tok = await tokenRequest({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri
  });
  await prisma.contaBancaria.update({
    where: { id: contaId },
    data: {
      bancoIntegrado: "MERCADO_PAGO",
      mpUserId: tok.user_id != null ? String(tok.user_id) : null,
      mpAccessTokenCripto: encryptSecret(tok.access_token as string),
      mpRefreshTokenCripto: tok.refresh_token ? encryptSecret(tok.refresh_token) : null,
      mpPublicKey: tok.public_key ?? null,
      mpTokenExpiraEm: new Date(Date.now() + (tok.expires_in ?? 15552000) * 1000)
    }
  });
  return { userId: tok.user_id != null ? String(tok.user_id) : null };
}

/**
 * Access token válido da conta (renova pelo refresh_token quando perto de expirar e persiste).
 * Lança BankError com orientação quando a conta não está conectada ou o refresh falhou.
 */
export async function garantirMpAccessToken(conta: {
  id: string;
  nome: string;
  mpAccessTokenCripto: string | null;
  mpRefreshTokenCripto: string | null;
  mpTokenExpiraEm: Date | null;
}): Promise<string> {
  if (!conta.mpAccessTokenCripto) {
    throw new BankError(`A conta "${conta.nome}" não está conectada ao Mercado Pago — use "Conectar Mercado Pago" em Configurações → Contas financeiras.`);
  }
  const expiraEm = conta.mpTokenExpiraEm?.getTime() ?? 0;
  const precisaRenovar = expiraEm - Date.now() < MARGEM_RENOVACAO_MS;
  if (!precisaRenovar) return decryptSecret(conta.mpAccessTokenCripto);

  const creds = await getMpAppCreds();
  if (!creds || !conta.mpRefreshTokenCripto) {
    // Sem como renovar: usa o token atual enquanto valer (o erro real aparecerá na chamada).
    return decryptSecret(conta.mpAccessTokenCripto);
  }
  try {
    const tok = await tokenRequest({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: "refresh_token",
      refresh_token: decryptSecret(conta.mpRefreshTokenCripto)
    });
    await prisma.contaBancaria.update({
      where: { id: conta.id },
      data: {
        mpAccessTokenCripto: encryptSecret(tok.access_token as string),
        mpRefreshTokenCripto: tok.refresh_token ? encryptSecret(tok.refresh_token) : conta.mpRefreshTokenCripto,
        mpTokenExpiraEm: new Date(Date.now() + (tok.expires_in ?? 15552000) * 1000)
      }
    });
    return tok.access_token as string;
  } catch (e) {
    // Refresh falhou (app trocada/da conta desautorizada): se o token atual ainda vale, segue com ele.
    if (expiraEm > Date.now()) return decryptSecret(conta.mpAccessTokenCripto);
    throw e;
  }
}

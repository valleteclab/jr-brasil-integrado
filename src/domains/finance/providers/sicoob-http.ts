import https from "node:https";
import { pfxTlsOptions } from "@/domains/fiscal/providers/pfx-utils";

/**
 * Base HTTP/autenticação compartilhada dos clientes Sicoob (Cobrança v3, Pix v2, Conta-Corrente v4).
 *
 *  - PRODUÇÃO: OAuth2 client_credentials em auth.sicoob.com.br com mTLS do A1 e-CNPJ da empresa
 *    (o MESMO certificado do fiscal) + client_id do credenciamento. O escopo varia por API.
 *  - SANDBOX: token Bearer fixo do portal dev (sem mTLS), com header client_id.
 */

const PROD_AUTH_URL = "https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token";

export class SicoobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SicoobError";
  }
}

export type SicoobAuth = {
  sandbox: boolean;
  clientId?: string | null;
  /** Token do portal (sandbox). */
  sandboxToken?: string | null;
  /** A1 da empresa para o mTLS de produção. */
  certificado?: { pfx: Buffer; senha: string } | null;
};

export type HttpResult = { statusCode: number; body: string };

function request(
  url: string,
  opts: { method: string; headers: Record<string, string>; tls?: { key: string; cert: string } | null },
  payload?: string
): Promise<HttpResult> {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: opts.method,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        headers: opts.headers,
        ...(opts.tls ? { key: opts.tls.key, cert: opts.tls.cert } : {}),
        timeout: 30000
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
      }
    );
    req.on("timeout", () => req.destroy(new Error("Timeout ao chamar a API do Sicoob.")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Obtém o access token (produção: client_credentials + mTLS com o escopo da API; sandbox: token do portal). */
async function getAccessToken(auth: SicoobAuth, scopes: string): Promise<{ token: string; tls: { key: string; cert: string } | null }> {
  if (auth.sandbox) {
    const token = auth.sandboxToken?.trim();
    if (!token) throw new SicoobError("Informe o token de sandbox do portal Sicoob Desenvolvedores na conta bancária.");
    return { token, tls: null };
  }
  if (!auth.clientId?.trim()) throw new SicoobError("Informe o client_id do credenciamento Sicoob na conta bancária.");
  if (!auth.certificado?.pfx) throw new SicoobError("Certificado A1 da empresa não disponível para o mTLS do Sicoob.");
  const tls = pfxTlsOptions(auth.certificado);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: auth.clientId.trim(),
    scope: scopes
  }).toString();
  const res = await request(PROD_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": String(Buffer.byteLength(body)) },
    tls
  }, body);
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new SicoobError(`Falha na autenticação Sicoob (HTTP ${res.statusCode}): ${res.body.slice(0, 300)}`);
  }
  const token = (JSON.parse(res.body) as { access_token?: string }).access_token;
  if (!token) throw new SicoobError("Autenticação Sicoob não retornou access_token.");
  return { token, tls };
}

/** Chamada autenticada a uma API Sicoob. `bases` define as URLs de produção e sandbox da API. */
export async function sicoobApi(
  auth: SicoobAuth,
  cfg: { prodBase: string; sandboxBase: string; scopes: string },
  method: string,
  path: string,
  payload?: unknown
): Promise<HttpResult> {
  const { token, tls } = await getAccessToken(auth, cfg.scopes);
  const base = auth.sandbox ? cfg.sandboxBase : cfg.prodBase;
  const body = payload !== undefined ? JSON.stringify(payload) : undefined;
  return request(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(auth.sandbox && auth.clientId ? { client_id: auth.clientId } : {}),
      ...(body ? { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(body)) } : {})
    },
    tls
  }, body);
}

export function parseErroSicoob(res: HttpResult): string {
  try {
    const data = JSON.parse(res.body) as {
      mensagens?: Array<{ mensagem?: string; codigo?: string }>;
      message?: string;
      detail?: string;
      violacoes?: Array<{ razao?: string; propriedade?: string }>;
    };
    const msgs = (data.mensagens ?? []).map((m) => `${m.codigo ? `${m.codigo}: ` : ""}${m.mensagem ?? ""}`).filter(Boolean);
    // APIs padrão BACEN (Pix) devolvem RFC 7807: detail + violacoes.
    const viol = (data.violacoes ?? []).map((v) => `${v.propriedade ? `${v.propriedade}: ` : ""}${v.razao ?? ""}`).filter(Boolean);
    const partes = [...msgs, data.detail, ...viol].filter(Boolean);
    if (partes.length) return `Sicoob rejeitou (HTTP ${res.statusCode}): ${partes.join("; ")}`;
    if (data.message) return `Sicoob (HTTP ${res.statusCode}): ${data.message}`;
  } catch { /* corpo não-JSON */ }
  return `Falha na API do Sicoob (HTTP ${res.statusCode}): ${res.body.slice(0, 300)}`;
}

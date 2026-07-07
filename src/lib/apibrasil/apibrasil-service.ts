import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/security/secret-crypto";

/**
 * Bureau de crédito ApiBrasil (conta MESTRE da plataforma) — CONSUMO AVULSO: autentica SÓ com o
 * Bearer Token (aba Credenciais), sem DeviceToken. Cada produto é selecionado pelo campo `tipo` no
 * corpo; `homolog` no corpo controla dados fictícios (grátis) vs produção (tarifado).
 * Ref. cURL (Boa Vista Acerta PF):
 *   POST /api/v2/consulta/cpf/credits  body {"tipo":"boa-vista-acerta-pf","cpf":"...","homolog":false}
 */

const GATEWAY = "https://gateway.apibrasil.io";
const TIMEOUT_MS = 30_000;

/** Catálogo dos produtos de crédito (endpoint + slug do `tipo` + chave do documento). */
export const PRODUTOS_CREDITO = {
  PF: { endpoint: "/api/v2/consulta/cpf/credits", tipo: "boa-vista-acerta-pf", docKey: "cpf" as const },
  // SQOD (produção): score + faturamento presumido + CONCESSÃO DE CRÉDITO + capacidade + PDF.
  PJ: { endpoint: "/api/v2/consulta/cnpj/credits", tipo: "sqod-cnpj", docKey: "cnpj" as const }
} satisfies Record<"PF" | "PJ", { endpoint: string; tipo: string; docKey: "cpf" | "cnpj" }>;

export type ApiBrasilRuntime = { token: string; endpointPF: string | null; endpointPJ: string | null; sandbox: boolean };

export type ConsultaCreditoRequest = { tipo: string; homolog: boolean } & ({ cpf: string } | { cnpj: string });
export type ConsultaCreditoEnvelope = {
  error: boolean;
  status_code?: number;
  message?: string;
  homolog?: boolean;
  valor_consulta?: number;
  balance?: string;
  data?: unknown;
};
export type ConsultaResposta = { ok: boolean; status: number; body: ConsultaCreditoEnvelope };

export async function getApiBrasilRuntime(): Promise<ApiBrasilRuntime | null> {
  const cfg = await prisma.plataformaCredito.findUnique({ where: { id: "default" } });
  if (!cfg?.apibrasilTokenCripto) return null;
  return {
    token: decryptSecret(cfg.apibrasilTokenCripto),
    endpointPF: cfg.apibrasilDevicePF,
    endpointPJ: cfg.apibrasilDevicePJ,
    sandbox: cfg.apibrasilSandbox
  };
}

/** Aceita path ("/api/v2/...") ou URL completa ("https://..."). */
function montarUrl(endpoint: string): string {
  return /^https?:\/\//.test(endpoint) ? endpoint : `${GATEWAY}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
}

/**
 * Consulta de crédito no bureau (avulso, Bearer). Monta o corpo com `tipo` + documento + `homolog`.
 * `path`, `tipo` e `body` são overridáveis (calibragem contra o painel sem redeploy). Timeout de 30s.
 */
export async function consultarCreditoApiBrasil(
  rt: ApiBrasilRuntime,
  tipoPessoa: "PF" | "PJ",
  documento: string,
  opts?: { path?: string; tipo?: string; homolog?: boolean; body?: Record<string, unknown> }
): Promise<ConsultaResposta> {
  const prod = PRODUTOS_CREDITO[tipoPessoa];
  const endpoint = opts?.path ?? (tipoPessoa === "PF" ? rt.endpointPF : rt.endpointPJ) ?? prod.endpoint;
  const doc = documento.replace(/\D/g, "");
  const homolog = opts?.homolog ?? rt.sandbox;
  const body = opts?.body ?? { tipo: opts?.tipo ?? prod.tipo, [prod.docKey]: doc, homolog };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(montarUrl(endpoint), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rt.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "XERP"
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const data = (await res.json().catch(() => ({}))) as ConsultaCreditoEnvelope;
    return { ok: res.ok && data?.error !== true, status: res.status, body: data };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("Bureau não respondeu no tempo (timeout de 30s).");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

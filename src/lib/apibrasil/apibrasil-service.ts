import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/security/secret-crypto";

/**
 * Bureau de crédito ApiBrasil (conta MESTRE da plataforma) — CONSUMO AVULSO: autentica SÓ com o
 * Bearer Token da aba Credenciais (NÃO usa DeviceToken). Cada produto (PF acerta, PJ sqod) tem seu
 * endpoint; guardamos o path/URL de cada um em `apibrasilDevicePF`/`apibrasilDevicePJ` (reaproveitados
 * como "endpoint por produto"). Path/body também são overridáveis para calibrar contra a doc/painel.
 */

const GATEWAY = "https://gateway.apibrasil.io";

export type ApiBrasilRuntime = { token: string; endpointPF: string | null; endpointPJ: string | null; sandbox: boolean };

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
 * Consulta de crédito no bureau (avulso, Bearer). Devolve status + corpo cru — normalização à parte.
 * `path` e `body` sobrescrevem o endpoint configurado (calibragem sem redeploy).
 */
export async function consultarCreditoApiBrasil(
  rt: ApiBrasilRuntime,
  tipo: "PF" | "PJ",
  documento: string,
  opts?: { path?: string; body?: Record<string, unknown> }
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const endpoint = opts?.path ?? (tipo === "PF" ? rt.endpointPF : rt.endpointPJ);
  if (!endpoint) throw new Error(`Endpoint da ApiBrasil para ${tipo} não configurado (Admin → Crédito & bureau).`);
  const doc = documento.replace(/\D/g, "");
  const body = opts?.body ?? (tipo === "PF" ? { cpf: doc } : { cnpj: doc });
  const res = await fetch(montarUrl(endpoint), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${rt.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "XERP"
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: data };
}

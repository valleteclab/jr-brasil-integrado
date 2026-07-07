import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/security/secret-crypto";

/**
 * Bureau de crédito ApiBrasil (conta MESTRE da plataforma). Auth: header `Authorization: Bearer`
 * (token da conta) + `DeviceToken` (do produto PF/PJ). O path do endpoint é confirmado pelo exemplo
 * do painel — por isso é overridável (calibração sem redeploy).
 * Gateway: https://gateway.apibrasil.io
 */

const GATEWAY = "https://gateway.apibrasil.io";

export type ApiBrasilRuntime = { token: string; devicePF: string | null; devicePJ: string | null; sandbox: boolean };

export async function getApiBrasilRuntime(): Promise<ApiBrasilRuntime | null> {
  const cfg = await prisma.plataformaCredito.findUnique({ where: { id: "default" } });
  if (!cfg?.apibrasilTokenCripto) return null;
  return {
    token: decryptSecret(cfg.apibrasilTokenCripto),
    devicePF: cfg.apibrasilDevicePF,
    devicePJ: cfg.apibrasilDevicePJ,
    sandbox: cfg.apibrasilSandbox
  };
}

/** Path padrão por tipo (best-guess, confirmável pelo painel/override). */
function pathPadrao(tipo: "PF" | "PJ"): string {
  return tipo === "PF" ? "/api/v2/credito/acerta" : "/api/v2/credito/consultapj";
}

/**
 * Faz a consulta de crédito no bureau. Devolve status + corpo cru — a normalização é separada.
 * `path` e `body` podem ser sobrescritos para calibrar contra o exemplo do painel.
 */
export async function consultarCreditoApiBrasil(
  rt: ApiBrasilRuntime,
  tipo: "PF" | "PJ",
  documento: string,
  opts?: { path?: string; body?: Record<string, unknown> }
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const device = tipo === "PF" ? rt.devicePF : rt.devicePJ;
  if (!device) throw new Error(`Device token do produto ${tipo} não configurado (Admin → Crédito & bureau).`);
  const path = opts?.path ?? pathPadrao(tipo);
  const doc = documento.replace(/\D/g, "");
  const body = opts?.body ?? (tipo === "PF" ? { cpf: doc } : { cnpj: doc });
  const res = await fetch(`${GATEWAY}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${rt.token}`,
      DeviceToken: device,
      "Content-Type": "application/json",
      "User-Agent": "XERP"
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: data };
}

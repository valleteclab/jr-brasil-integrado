import { normalizeDocumento } from "@/lib/fiscal/documento";

export type SelfServicePlan = "EMISSOR" | "CHAT";

/**
 * Excecao controlada para testar o onboarding CHAT com um CNPJ que ja possui conta.
 * Nao aceita curingas: cada documento precisa estar explicitamente na allowlist.
 */
export function canRepeatCnpjForChatTest(cnpj: string, plano: SelfServicePlan): boolean {
  if (plano !== "CHAT") return false;

  const documento = normalizeDocumento(cnpj);
  if (!documento) return false;

  return (process.env.CADASTRO_TEST_CNPJ_ALLOWLIST ?? "")
    .split(",")
    .map((item) => normalizeDocumento(item))
    .filter(Boolean)
    .includes(documento);
}

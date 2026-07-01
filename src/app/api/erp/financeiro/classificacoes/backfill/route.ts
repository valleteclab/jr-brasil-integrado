import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { backfillClassificacoes } from "@/domains/finance/application/classificacao-use-cases";

/**
 * Classifica automaticamente as contas sem classificação (idempotente): entrada fiscal pela
 * finalidade dos itens, demais contas a pagar pela memória do fornecedor, recebíveis de venda/OS
 * pelas receitas padrão.
 */
export async function POST() {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const { pagar, receber } = await backfillClassificacoes(scope);
    return NextResponse.json({ pagar, receber });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao classificar as contas.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 500) });
  }
}

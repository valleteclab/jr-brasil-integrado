import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { backfillClassificacoes, seedPlanoPadrao } from "@/domains/finance/application/classificacao-use-cases";

/**
 * Cria o plano de classificações padrão (idempotente — só adiciona as que faltam) e, em seguida,
 * classifica automaticamente as contas EXISTENTES (backfill: entrada fiscal por finalidade, memória
 * do fornecedor, recebíveis de venda/OS) — zero retrabalho para o legado.
 */
export async function POST() {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const { criadas } = await seedPlanoPadrao(scope);
    const { pagar, receber } = await backfillClassificacoes(scope);
    return NextResponse.json({ criadas, contasClassificadas: pagar + receber });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar o plano padrão.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 500) });
  }
}

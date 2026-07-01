import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { seedPlanoPadrao } from "@/domains/finance/application/classificacao-use-cases";

/** Cria o plano de classificações padrão (idempotente — só adiciona as que faltam). */
export async function POST() {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const { criadas } = await seedPlanoPadrao(scope);
    return NextResponse.json({ criadas });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar o plano padrão.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 500) });
  }
}

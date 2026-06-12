import { NextResponse } from "next/server";
import { testOpenRouter } from "@/domains/ai/openrouter-service";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";

export async function POST() {
  try {
    await requireModulo("configuracoes");
    const scope = await getDevelopmentTenantScope();
    const result = await testOpenRouter(scope);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível testar a IA.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

import { NextResponse } from "next/server";
import { testOpenRouter } from "@/domains/ai/openrouter-service";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export async function POST() {
  try {
    const scope = await getDevelopmentTenantScope();
    const result = await testOpenRouter(scope);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível testar a IA.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

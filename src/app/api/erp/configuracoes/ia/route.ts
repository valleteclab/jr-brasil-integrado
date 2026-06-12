import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo, requireAdmin } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { getAiConfig, saveAiConfig } from "@/domains/ai/openrouter-service";

export async function GET() {
  try {
    await requireModulo("configuracoes");
    const scope = await getDevelopmentTenantScope();
    const config = await getAiConfig(scope);

    return NextResponse.json(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível carregar a configuração de IA.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

export async function PUT(request: Request) {
  try {
    // Grava a chave OpenRouter (segredo) — restrito a admin.
    await requireAdmin();
    const body = await request.json() as {
      apiKey?: string;
      model?: string;
      enabled?: boolean;
      notes?: string;
    };

    const scope = await getDevelopmentTenantScope();
    const config = await saveAiConfig(scope, {
      apiKey: body.apiKey,
      model: body.model || "openai/gpt-4o-mini",
      enabled: Boolean(body.enabled),
      notes: body.notes
    });

    return NextResponse.json(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível salvar a configuração de IA.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

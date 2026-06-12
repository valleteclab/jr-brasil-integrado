import { NextResponse } from "next/server";
import { getCosmosConfig, saveCosmosConfig } from "@/domains/products/application/cosmos-service";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo, requireAdmin } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";

export async function GET() {
  try {
    await requireModulo("configuracoes");
    const scope = await getDevelopmentTenantScope();
    const config = await getCosmosConfig(scope);
    return NextResponse.json(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível carregar a configuração do Cosmos.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

export async function PUT(request: Request) {
  try {
    // Grava o token do Cosmos (segredo) — restrito a admin.
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const config = await saveCosmosConfig(scope, await request.json());
    return NextResponse.json(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível salvar a configuração do Cosmos.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

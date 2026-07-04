import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { BancoConfigError, configurarBancoIntegrado, type ConfigBancoInput } from "@/domains/finance/application/bank-config-use-cases";

/** Configura o banco integrado (Sicredi/Itaú) da conta bancária: provedor + credenciais. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as ConfigBancoInput;
    await configurarBancoIntegrado(scope, params.id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar a configuração bancária.";
    const status = authErrorStatus(error, error instanceof BancoConfigError ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}

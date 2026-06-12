import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { testFiscalConnection } from "@/domains/fiscal/application/fiscal-config-use-cases";

export async function POST() {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    return NextResponse.json(await testFiscalConnection(scope));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao testar conexão com o provedor fiscal.";
    return NextResponse.json({ ok: false, message }, { status: authErrorStatus(error, 400) });
  }
}

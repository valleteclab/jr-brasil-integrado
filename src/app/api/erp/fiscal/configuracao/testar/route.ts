import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { testFiscalConnection } from "@/domains/fiscal/application/fiscal-config-use-cases";

export async function POST() {
  try {
    const scope = await getDevelopmentTenantScope();
    return NextResponse.json(await testFiscalConnection(scope));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao testar conexão com o provedor fiscal.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { detectarMonofasicosPorNcm } from "@/domains/fiscal/simples/apuracao-simples-use-cases";

/** Marca em massa os produtos monofásicos pelo NCM (listas das Leis 10.485/10.147/13.097/9.718). */
export async function POST() {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const r = await detectarMonofasicosPorNcm(scope, session?.usuarioId);
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao detectar produtos monofásicos.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 500) });
  }
}

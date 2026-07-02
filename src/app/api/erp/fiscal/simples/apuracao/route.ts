import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { SimplesError, apuracaoSimples } from "@/domains/fiscal/simples/apuracao-simples-use-cases";

/** Apuração estimada do Simples/MEI. Query: ?mes=&ano= (padrão: mês atual). */
export async function GET(request: Request) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const q = new URL(request.url).searchParams;
    const hoje = new Date();
    const r = await apuracaoSimples(scope, {
      mes: Number(q.get("mes")) || hoje.getMonth() + 1,
      ano: Number(q.get("ano")) || hoje.getFullYear()
    });
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro na apuração do Simples.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof SimplesError ? 400 : 500) });
  }
}

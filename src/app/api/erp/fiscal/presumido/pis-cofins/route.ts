import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { PresumidoError } from "@/domains/fiscal/presumido/apuracao-presumido-use-cases";
import { apuracaoPisCofins } from "@/domains/fiscal/presumido/pis-cofins-use-cases";

/** Apuração mensal de PIS/COFINS. Query: ?ano=&mes= (padrão: mês anterior fechado). */
export async function GET(request: Request) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const q = new URL(request.url).searchParams;
    const hoje = new Date();
    const r = await apuracaoPisCofins(scope, {
      ano: Number(q.get("ano")) || hoje.getFullYear(),
      mes: Number(q.get("mes")) || hoje.getMonth() + 1
    });
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro na apuração do PIS/COFINS.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof PresumidoError ? 400 : 500) });
  }
}

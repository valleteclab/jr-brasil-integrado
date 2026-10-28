import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { PresumidoError, apuracaoPresumido } from "@/domains/fiscal/presumido/apuracao-presumido-use-cases";
import { trimestreDoMes } from "@/domains/fiscal/presumido/tabelas-presuncao";

/** Apuração do IRPJ/CSLL no Lucro Presumido. Query: ?ano=&trimestre= (padrão: trimestre atual). */
export async function GET(request: Request) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const q = new URL(request.url).searchParams;
    const hoje = new Date();
    const r = await apuracaoPresumido(scope, {
      ano: Number(q.get("ano")) || hoje.getFullYear(),
      trimestre: Number(q.get("trimestre")) || trimestreDoMes(hoje.getMonth() + 1)
    });
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro na apuração do Lucro Presumido.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof PresumidoError ? 400 : 500) });
  }
}

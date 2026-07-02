import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { BoletoError } from "@/domains/finance/application/boleto-use-cases";
import { extratoConciliado } from "@/domains/finance/application/extrato-use-cases";

/** Extrato do banco (Sicoob) conciliado com os movimentos do ERP. Query: ?mes=&ano=&diaInicial=&diaFinal= */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const q = new URL(request.url).searchParams;
    const hoje = new Date();
    const r = await extratoConciliado(scope, params.id, {
      mes: Number(q.get("mes")) || hoje.getMonth() + 1,
      ano: Number(q.get("ano")) || hoje.getFullYear(),
      diaInicial: q.get("diaInicial") ? Number(q.get("diaInicial")) : undefined,
      diaFinal: q.get("diaFinal") ? Number(q.get("diaFinal")) : undefined
    });
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao consultar o extrato.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof BoletoError ? 400 : 500) });
  }
}

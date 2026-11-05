import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo, getSession } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { reabrirFaturaCartao, FaturaCartaoError } from "@/domains/finance/application/fatura-cartao-use-cases";

/** Desfaz um fechamento prematuro (só enquanto a conta gerada não tiver pagamento). */
export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const fatura = await reabrirFaturaCartao(scope, params.id, session?.usuarioId);
    return NextResponse.json({ id: fatura.id, status: fatura.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao reabrir a fatura.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof FaturaCartaoError ? 400 : 500) });
  }
}

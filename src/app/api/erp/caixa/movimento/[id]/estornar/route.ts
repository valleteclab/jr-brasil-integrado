import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { estornarMovimentoCaixa, CaixaError } from "@/domains/cashier/application/cashier-use-cases";

/** Estorna uma sangria/suprimento do caixa aberto (fica no histórico e sai das contas). */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const sessao = await requireModulo("caixa");
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json().catch(() => ({}))) as { motivo?: string };
    const mov = await estornarMovimentoCaixa(scope, { movimentoId: params.id, motivo: body.motivo ?? "", usuarioId: sessao.usuarioId });
    return NextResponse.json({ id: mov.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao estornar o lançamento.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof CaixaError ? 400 : 500) });
  }
}

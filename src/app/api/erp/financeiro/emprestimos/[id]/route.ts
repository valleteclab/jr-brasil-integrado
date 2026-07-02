import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { EmprestimoError, cancelarEmprestimo, getEmprestimoDetalhe } from "@/domains/finance/application/emprestimo-use-cases";

/** Detalhe do contrato com o cronograma completo (parcelas pagas/abertas, juros, saldo devedor). */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    return NextResponse.json(await getEmprestimoDetalhe(scope, params.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar o empréstimo.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof EmprestimoError ? 404 : 500) });
  }
}

/** Cancela o contrato (parcelas em aberto viram CANCELADO; as pagas ficam no histórico). */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const r = await cancelarEmprestimo(scope, params.id, session?.usuarioId);
    return NextResponse.json({ status: r.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao cancelar o empréstimo.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof EmprestimoError ? 400 : 500) });
  }
}

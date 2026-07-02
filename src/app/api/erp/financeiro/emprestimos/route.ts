import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { EmprestimoError, createEmprestimo, listEmprestimos, type SistemaAmortizacao } from "@/domains/finance/application/emprestimo-use-cases";

export async function GET() {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    return NextResponse.json({ emprestimos: await listEmprestimos(scope) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar empréstimos.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 500) });
  }
}

type Body = {
  tipo?: string;
  instituicao: string;
  fornecedorId?: string | null;
  numeroContrato?: string | null;
  dataContratacao: string;
  valorPrincipal: number;
  taxaJurosMensal?: number;
  sistemaAmortizacao: SistemaAmortizacao;
  totalParcelas: number;
  parcelasJaPagas?: number;
  valorParcela?: number | null;
  primeiroVencimento: string;
  contaBancariaId?: string | null;
  classificacaoId?: string | null;
  observacoes?: string | null;
};

/** Cria o contrato e gera as parcelas em aberto no contas a pagar. */
export async function POST(request: Request) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as Body;
    const emprestimo = await createEmprestimo(scope, {
      ...body,
      dataContratacao: new Date(`${body.dataContratacao}T12:00:00`),
      primeiroVencimento: new Date(`${body.primeiroVencimento}T12:00:00`),
      valorPrincipal: Number(body.valorPrincipal),
      taxaJurosMensal: Number(body.taxaJurosMensal ?? 0),
      totalParcelas: Number(body.totalParcelas),
      parcelasJaPagas: Number(body.parcelasJaPagas ?? 0),
      valorParcela: body.valorParcela != null && body.valorParcela !== 0 ? Number(body.valorParcela) : null
    }, session?.usuarioId);
    return NextResponse.json({ id: emprestimo.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao cadastrar o empréstimo.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof EmprestimoError ? 400 : 500) });
  }
}

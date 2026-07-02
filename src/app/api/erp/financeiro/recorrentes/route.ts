import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { RecorrenciaError, createRecorrencia, listRecorrencias } from "@/domains/finance/application/recorrencia-use-cases";

export async function GET() {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    return NextResponse.json({ recorrencias: await listRecorrencias(scope) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar despesas recorrentes.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 500) });
  }
}

/** Cria a despesa recorrente e já materializa as competências devidas no contas a pagar. */
export async function POST(request: Request) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as {
      descricao: string;
      fornecedorId?: string | null;
      valor: number;
      valorVariavel?: boolean;
      periodicidade?: string;
      diaVencimento: number;
      dataInicio: string;
      dataFim?: string | null;
      formaPagamento?: string | null;
      contaBancariaId?: string | null;
      classificacaoId?: string | null;
      observacoes?: string | null;
    };
    const r = await createRecorrencia(scope, {
      ...body,
      valor: Number(body.valor),
      diaVencimento: Number(body.diaVencimento),
      dataInicio: new Date(`${body.dataInicio}T12:00:00`),
      dataFim: body.dataFim ? new Date(`${body.dataFim}T12:00:00`) : null
    }, session?.usuarioId);
    return NextResponse.json({ id: r.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar a despesa recorrente.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof RecorrenciaError ? 400 : 500) });
  }
}

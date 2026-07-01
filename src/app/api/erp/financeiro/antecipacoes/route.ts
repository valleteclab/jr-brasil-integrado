import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { AntecipacaoError, criarAntecipacao } from "@/domains/finance/application/antecipacao-use-cases";

/** Registra uma antecipação de recebíveis: baixa os títulos pelo bruto e lança a taxa como despesa paga. */
export async function POST(request: Request) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = await request.json() as {
      contaBancariaId: string;
      contaReceberIds: string[];
      valorTaxa: number;
      dataOperacao?: string;
      instituicao?: string;
      observacoes?: string;
    };
    const resultado = await criarAntecipacao(scope, {
      contaBancariaId: body.contaBancariaId,
      contaReceberIds: body.contaReceberIds ?? [],
      valorTaxa: Number(body.valorTaxa) || 0,
      dataOperacao: body.dataOperacao ? new Date(`${body.dataOperacao}T12:00:00`) : undefined,
      instituicao: body.instituicao,
      observacoes: body.observacoes
    }, session?.usuarioId);
    return NextResponse.json(resultado);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao registrar a antecipação.";
    const status = authErrorStatus(error, error instanceof AntecipacaoError ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}

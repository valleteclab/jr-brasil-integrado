import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import {
  ClassificacaoValidationError,
  createClassificacao,
  listClassificacoes
} from "@/domains/finance/application/classificacao-use-cases";
import type { TipoClassificacaoFinanceira } from "@prisma/client";

export async function GET() {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const classificacoes = await listClassificacoes(scope, { incluirInativas: true });
    return NextResponse.json({ classificacoes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar classificações.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 500) });
  }
}

export async function POST(request: Request) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const body = await request.json() as {
      codigo?: string;
      nome: string;
      grupo: string;
      tipo?: TipoClassificacaoFinanceira;
      orcamentoMensal?: number;
    };
    const criada = await createClassificacao(scope, {
      codigo: body.codigo,
      nome: body.nome,
      grupo: body.grupo,
      tipo: body.tipo,
      orcamentoMensal: body.orcamentoMensal !== undefined ? Number(body.orcamentoMensal) : undefined
    });
    return NextResponse.json({ id: criada.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar classificação.";
    const status = authErrorStatus(error, error instanceof ClassificacaoValidationError ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}

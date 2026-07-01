import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import {
  ClassificacaoValidationError,
  deleteClassificacao,
  updateClassificacao
} from "@/domains/finance/application/classificacao-use-cases";
import type { TipoClassificacaoFinanceira } from "@prisma/client";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const body = await request.json() as {
      codigo?: string | null;
      nome?: string;
      grupo?: string;
      tipo?: TipoClassificacaoFinanceira;
      orcamentoMensal?: number;
      ativo?: boolean;
    };
    await updateClassificacao(scope, params.id, {
      ...(body.codigo !== undefined ? { codigo: body.codigo } : {}),
      ...(body.nome !== undefined ? { nome: body.nome } : {}),
      ...(body.grupo !== undefined ? { grupo: body.grupo } : {}),
      ...(body.tipo !== undefined ? { tipo: body.tipo } : {}),
      ...(body.orcamentoMensal !== undefined ? { orcamentoMensal: Number(body.orcamentoMensal) } : {}),
      ...(body.ativo !== undefined ? { ativo: body.ativo } : {})
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar classificação.";
    const status = authErrorStatus(error, error instanceof ClassificacaoValidationError ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const resultado = await deleteClassificacao(scope, params.id);
    return NextResponse.json(resultado);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir classificação.";
    const status = authErrorStatus(error, error instanceof ClassificacaoValidationError ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}

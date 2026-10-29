import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { FinanceValidationError } from "@/domains/finance/application/finance-use-cases";
import { criarLancamentoDaLinha } from "@/domains/finance/application/ofx-use-cases";

/** Cria a conta a pagar/receber a partir da linha do extrato e já vincula (sai quitada). */
export async function POST(request: Request) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as {
      linhaId?: string;
      descricao?: string;
      fornecedorId?: string | null;
      clienteId?: string | null;
      classificacaoId?: string | null;
    };
    if (!body.linhaId) throw new FinanceValidationError("Informe a linha do extrato.");
    const r = await criarLancamentoDaLinha(
      scope,
      {
        linhaId: body.linhaId,
        descricao: body.descricao,
        fornecedorId: body.fornecedorId ?? null,
        clienteId: body.clienteId ?? null,
        classificacaoId: body.classificacaoId ?? null
      },
      session?.usuarioId
    );
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar o lançamento.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof FinanceValidationError ? 400 : 500) });
  }
}

import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { FinanceValidationError } from "@/domains/finance/application/finance-use-cases";
import { conciliarLinha, conciliarLote, reabrirLinha } from "@/domains/finance/application/ofx-use-cases";

/** Vincula linha(s) do extrato a título(s) e dá a baixa com a data/valor do banco. */
export async function POST(request: Request) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as {
      linhaId?: string;
      contaPagarId?: string | null;
      contaReceberId?: string | null;
      vinculos?: Array<{ linhaId: string; contaPagarId?: string | null; contaReceberId?: string | null }>;
      reabrir?: boolean;
    };

    if (body.reabrir && body.linhaId) {
      return NextResponse.json(await reabrirLinha(scope, body.linhaId, session?.usuarioId));
    }
    if (body.vinculos?.length) {
      return NextResponse.json(await conciliarLote(scope, body.vinculos, session?.usuarioId));
    }
    if (!body.linhaId) throw new FinanceValidationError("Informe a linha do extrato.");
    const r = await conciliarLinha(
      scope,
      { linhaId: body.linhaId, contaPagarId: body.contaPagarId ?? null, contaReceberId: body.contaReceberId ?? null },
      session?.usuarioId
    );
    return NextResponse.json({ id: r.id, status: r.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao conciliar.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof FinanceValidationError ? 400 : 500) });
  }
}

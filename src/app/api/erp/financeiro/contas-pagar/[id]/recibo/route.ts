import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { FinanceValidationError } from "@/domains/finance/application/finance-use-cases";
import { emitirRecibo, reciboDaConta } from "@/domains/finance/application/recibo-use-cases";

/** Recibo já emitido desta conta (se houver). */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    return NextResponse.json({ recibo: await reciboDaConta(scope, params.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao buscar o recibo.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 500) });
  }
}

/** Emite o recibo de pagamento da conta (ou devolve o que já existe). */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const recibo = await emitirRecibo(
      scope,
      {
        contaPagarId: params.id,
        favorecidoNome: typeof body.favorecidoNome === "string" ? body.favorecidoNome : undefined,
        favorecidoDocumento: typeof body.favorecidoDocumento === "string" ? body.favorecidoDocumento : undefined,
        referente: typeof body.referente === "string" ? body.referente : undefined,
        dataPagamento: typeof body.dataPagamento === "string" ? body.dataPagamento : undefined,
        formaPagamento: typeof body.formaPagamento === "string" ? body.formaPagamento : undefined,
        cidade: typeof body.cidade === "string" ? body.cidade : undefined,
        observacao: typeof body.observacao === "string" ? body.observacao : undefined,
        valor: typeof body.valor === "number" ? body.valor : undefined
      },
      session?.usuarioId
    );
    return NextResponse.json({ recibo });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao emitir o recibo.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof FinanceValidationError ? 400 : 500) });
  }
}

import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { BoletoError } from "@/domains/finance/application/boleto-use-cases";
import { lancarLinhaExtrato } from "@/domains/finance/application/extrato-use-cases";

/**
 * CONCILIAÇÃO MANUAL: lança no ERP uma transação que está só no extrato do banco.
 * Body: { data, descricao, documento?, valor, classificacaoId?, descricaoErp? }.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as {
      data: string;
      descricao: string;
      documento?: string | null;
      valor: number;
      classificacaoId?: string | null;
      descricaoErp?: string | null;
      confirmarSemNota?: boolean;
    };
    const r = await lancarLinhaExtrato(scope, params.id, body, session?.usuarioId);
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao lançar a transação.";
    // Aviso de ordem do fluxo (já existe despesa, ou há nota a lançar) não é falha: devolve 409
    // para a tela oferecer conciliar com o que existe em vez de criar outra despesa.
    const avisos = (error as { avisos?: string[] })?.avisos;
    return NextResponse.json(
      { error: message, ...(avisos ? { avisos } : {}) },
      { status: avisos ? 409 : authErrorStatus(error, error instanceof BoletoError ? 400 : 500) }
    );
  }
}

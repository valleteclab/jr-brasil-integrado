import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { BoletoError, baixarBoletoNoBanco } from "@/domains/finance/application/boleto-use-cases";

/** Baixa (cancela) o boleto NO BANCO — deixa de ser pagável; o título permanece no ERP. */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const boleto = await baixarBoletoNoBanco(scope, params.id, session?.usuarioId);
    return NextResponse.json({ status: boleto.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao baixar o boleto no banco.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof BoletoError ? 400 : 500) });
  }
}

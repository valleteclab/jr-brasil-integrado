import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { BoletoError, gerarBoletoParaRecebivel } from "@/domains/finance/application/boleto-use-cases";

/** Registra o boleto Sicoob deste título. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = await request.json() as { contaBancariaId: string };
    const boleto = await gerarBoletoParaRecebivel(scope, params.id, { contaBancariaId: body.contaBancariaId }, session?.usuarioId);
    return NextResponse.json({
      id: boleto.id,
      status: boleto.status,
      nossoNumero: boleto.nossoNumero,
      linhaDigitavel: boleto.linhaDigitavel,
      temPdf: Boolean(boleto.pdfBase64)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao emitir o boleto.";
    const status = authErrorStatus(error, error instanceof BoletoError ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}

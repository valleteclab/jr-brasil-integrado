import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { BoletoError, pdfDoBoleto } from "@/domains/finance/application/boleto-use-cases";

/** 2ª via do boleto em PDF. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const pdf = await pdfDoBoleto(scope, params.id);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="boleto-${params.id}.pdf"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao baixar o boleto.";
    const status = authErrorStatus(error, error instanceof BoletoError ? 404 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}

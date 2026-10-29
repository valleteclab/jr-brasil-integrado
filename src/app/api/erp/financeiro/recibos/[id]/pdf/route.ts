import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { FinanceValidationError } from "@/domains/finance/application/finance-use-cases";
import { pdfDoRecibo } from "@/domains/finance/application/recibo-use-cases";

export const dynamic = "force-dynamic";

/** PDF do recibo (duas vias na mesma folha). */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const { pdf, nomeArquivo } = await pdfDoRecibo(scope, params.id);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${nomeArquivo}"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar o PDF do recibo.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof FinanceValidationError ? 400 : 500) });
  }
}

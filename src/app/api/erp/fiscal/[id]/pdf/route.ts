import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { downloadNotaFiscalDocumento } from "@/domains/fiscal/application/fiscal-emission-use-cases";

// Baixa o PDF (DANFE/DANFSE) da nota via provedor (server-side, requer Bearer).
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const { contentType, body, filename } = await downloadNotaFiscalDocumento(scope, params.id, "pdf");
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filename}"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao baixar o PDF da nota fiscal.";
    const isValidation = message.includes("não encontrada") || message.includes("não possui") || message.includes("Só é possível") || message.includes("não suporta");
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, isValidation ? 400 : 500) });
  }
}

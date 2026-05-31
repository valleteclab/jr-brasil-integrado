import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { downloadNotaFiscalDocumento } from "@/domains/fiscal/application/fiscal-emission-use-cases";

// Baixa o XML autorizado da nota via provedor (server-side, requer Bearer).
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const scope = await getDevelopmentTenantScope();
    const { contentType, body, filename } = await downloadNotaFiscalDocumento(scope, params.id, "xml");
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao baixar o XML da nota fiscal.";
    const isValidation = message.includes("não encontrada") || message.includes("não possui") || message.includes("Só é possível") || message.includes("não suporta");
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 });
  }
}

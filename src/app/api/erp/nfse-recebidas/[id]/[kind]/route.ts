import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { downloadNfseDistribuido } from "@/lib/services/nfse-distribution";

// Baixa o DANFSE (PDF) ou o XML de uma NFS-e da distribuição do Ambiente Nacional.
export async function GET(_request: Request, { params }: { params: { id: string; kind: string } }) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const kind = params.kind === "xml" ? "xml" : "pdf";
    const { contentType, body, filename } = await downloadNfseDistribuido(scope, params.id, kind);
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${kind === "pdf" ? "inline" : "attachment"}; filename="${filename}"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao baixar o documento da NFS-e.";
    const isValidation = message.includes("não encontrada") || message.includes("não disponível") || message.includes("sem chave") || message.includes("não suporta");
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, isValidation ? 400 : 500) });
  }
}

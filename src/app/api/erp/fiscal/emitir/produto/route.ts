import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { emitProductInvoiceAvulsa, StandaloneEmissionError } from "@/domains/fiscal/application/standalone-emission-use-cases";

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const nota = await emitProductInvoiceAvulsa(scope, await request.json());
    return NextResponse.json({ id: nota.id, status: nota.status, numero: nota.numero, chaveAcesso: nota.chaveAcesso, motivo: nota.motivo });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao emitir a nota fiscal de produto.";
    const status = error instanceof StandaloneEmissionError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

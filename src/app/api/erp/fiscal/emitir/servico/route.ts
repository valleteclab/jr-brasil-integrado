import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { emitServiceInvoiceAvulsa, StandaloneEmissionError } from "@/domains/fiscal/application/standalone-emission-use-cases";

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const nota = await emitServiceInvoiceAvulsa(scope, await request.json());
    return NextResponse.json({ id: nota.id, status: nota.status, numero: nota.numero, motivo: nota.motivo });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao emitir a NFS-e.";
    const status = error instanceof StandaloneEmissionError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

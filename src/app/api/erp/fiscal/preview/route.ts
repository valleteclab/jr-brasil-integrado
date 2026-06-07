import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { previewProductInvoiceAvulsa, StandaloneEmissionError } from "@/domains/fiscal/application/standalone-emission-use-cases";

// Espelho fiscal da emissão avulsa de produto: calcula os tributos (ICMS/ST/IPI/PIS/COFINS)
// exatamente como sairiam no XML, sem persistir nem enviar ao provedor.
export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const preview = await previewProductInvoiceAvulsa(scope, await request.json());
    return NextResponse.json(preview);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao calcular o espelho fiscal.";
    const status = error instanceof StandaloneEmissionError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

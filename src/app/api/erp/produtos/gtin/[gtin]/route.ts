import { NextResponse } from "next/server";
import { lookupProdutoGtin } from "@/domains/products/application/dataload-dados-service";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";

// Consulta dados do produto por GTIN: Dataload primeiro (sem cota), Cosmos como fallback.
export async function GET(_request: Request, { params }: { params: { gtin: string } }) {
  try {
    await requireModulo("produtos");
    const scope = await getDevelopmentTenantScope();
    const produto = await lookupProdutoGtin(scope, params.gtin);
    return NextResponse.json(produto);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível consultar o código de barras.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

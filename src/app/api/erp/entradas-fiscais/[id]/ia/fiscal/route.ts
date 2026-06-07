import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { suggestEntryItemsFiscalWithAi } from "@/domains/products/application/ai-enrichment-use-cases";

type RouteContext = { params: { id: string } };

// Sugere dados fiscais (NCM/CEST/categoria) em lote para os itens da entrada sem NCM definido.
export async function POST(_request: Request, context: RouteContext) {
  try {
    const scope = await getDevelopmentTenantScope();
    const suggestions = await suggestEntryItemsFiscalWithAi(scope, context.params.id);
    return NextResponse.json({ suggestions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível sugerir dados fiscais com IA.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

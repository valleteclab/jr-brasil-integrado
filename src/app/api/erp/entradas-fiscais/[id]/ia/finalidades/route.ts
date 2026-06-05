import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { suggestFiscalEntryFinalidadesWithAi } from "@/domains/products/application/fiscal-entry-use-cases";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const scope = await getDevelopmentTenantScope();
    const suggestions = await suggestFiscalEntryFinalidadesWithAi(scope, context.params.id);

    return NextResponse.json({ suggestions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível sugerir finalidades com IA.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

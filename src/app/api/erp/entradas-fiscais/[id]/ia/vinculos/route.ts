import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { suggestFiscalEntryLinksWithAi } from "@/domains/products/application/fiscal-entry-use-cases";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const scope = await getDevelopmentTenantScope();
    const suggestions = await suggestFiscalEntryLinksWithAi(scope, context.params.id);

    return NextResponse.json({ suggestions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível sugerir vínculos com IA.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

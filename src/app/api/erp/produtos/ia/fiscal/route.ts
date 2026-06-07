import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { suggestProductFiscalWithAi } from "@/domains/products/application/ai-enrichment-use-cases";

// Sugere dados fiscais (descrição, categoria, NCM/CEST) de um produto a partir da descrição/GTIN.
export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json().catch(() => ({}))) as {
      descricao?: string;
      gtin?: string | null;
      ncmAtual?: string | null;
      marca?: string | null;
    };
    const sugestao = await suggestProductFiscalWithAi(scope, {
      descricao: body.descricao ?? "",
      gtin: body.gtin ?? null,
      ncmAtual: body.ncmAtual ?? null,
      marca: body.marca ?? null
    });
    return NextResponse.json(sugestao);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível sugerir dados fiscais com IA.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

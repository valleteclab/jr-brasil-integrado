import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { consultarImagemDataload } from "@/domains/products/application/dataload-service";

// Verifica/retorna a imagem do produto pelo GTIN no banco de imagens Dataload.
export async function GET(_request: Request, { params }: { params: { gtin: string } }) {
  try {
    await getDevelopmentTenantScope();
    const imagem = await consultarImagemDataload(params.gtin);
    return NextResponse.json(imagem);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível consultar a imagem.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

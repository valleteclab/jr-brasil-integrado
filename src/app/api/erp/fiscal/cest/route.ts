import { NextResponse } from "next/server";
import { searchCest } from "@/lib/services/fiscal-codes";

// CESTs candidatos para um produto: prioriza os vinculados ao NCM; senão busca por descrição.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const ncm = url.searchParams.get("ncm");
    const q = url.searchParams.get("q");
    const cests = await searchCest(ncm, q);
    return NextResponse.json({ cests });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível consultar o CEST.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

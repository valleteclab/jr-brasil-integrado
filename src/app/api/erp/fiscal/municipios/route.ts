import { NextResponse } from "next/server";
import { listMunicipios } from "@/lib/services/fiscal-codes";

// Municípios de uma UF (para seletor de endereço). Ex.: /api/erp/fiscal/municipios?uf=BA
export async function GET(request: Request) {
  try {
    const uf = new URL(request.url).searchParams.get("uf") ?? "";
    if (uf.trim().length !== 2) return NextResponse.json({ municipios: [] });
    const municipios = await listMunicipios(uf);
    return NextResponse.json({ municipios });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível listar municípios.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

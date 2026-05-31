import { NextResponse } from "next/server";
import { lookupCep, CadastroLookupError } from "@/lib/lookup/cadastro-lookup";

// Consulta CEP (ViaCEP) — server-side. Autopreenche endereço de cadastros.
export async function GET(_request: Request, { params }: { params: { cep: string } }) {
  try {
    const data = await lookupCep(params.cep);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao consultar o CEP.";
    return NextResponse.json({ error: message }, { status: error instanceof CadastroLookupError ? 400 : 500 });
  }
}

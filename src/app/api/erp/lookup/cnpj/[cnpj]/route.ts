import { NextResponse } from "next/server";
import { lookupCnpj, CadastroLookupError } from "@/lib/lookup/cadastro-lookup";

// Consulta CNPJ (BrasilAPI/Receita) — server-side. Autopreenche cadastros PJ.
export async function GET(_request: Request, { params }: { params: { cnpj: string } }) {
  try {
    const data = await lookupCnpj(params.cnpj);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao consultar o CNPJ.";
    return NextResponse.json({ error: message }, { status: error instanceof CadastroLookupError ? 400 : 500 });
  }
}

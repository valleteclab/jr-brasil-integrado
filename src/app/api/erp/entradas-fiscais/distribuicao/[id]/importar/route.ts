import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/auth/session";
import { importDistributedNfe } from "@/lib/services/nfe-distribution";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireModulo("entradas-fiscais");
    if (!session.scope) return NextResponse.json({ error: "Sessão sem empresa." }, { status: 401 });
    const result = await importDistributedNfe(session.scope, params.id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível importar a NF-e recebida.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

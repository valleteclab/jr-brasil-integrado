import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/auth/session";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { importDistributedNfe } from "@/lib/services/nfe-distribution";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("entradas-fiscais");
    // Usa o scope COM o ambiente vigente da empresa (session.scope não carrega o ambiente — senão a
    // entrada é criada como HOMOLOGACAO mesmo em produção).
    const scope = await getDevelopmentTenantScope();
    const result = await importDistributedNfe(scope, params.id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível importar a NF-e recebida.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

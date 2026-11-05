import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/auth/session";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { importarNfseComoDespesa, type ImportarNfseDespesaInput } from "@/lib/services/nfse-distribution";

export const dynamic = "force-dynamic";

/** Lança a NFS-e recebida (tomador) como DESPESA (ContaPagar) com forma/conta/classificação. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json().catch(() => ({}))) as ImportarNfseDespesaInput;
    const result = await importarNfseComoDespesa(scope, params.id, body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível lançar a despesa da NFS-e.";
    // Suspeita de duplicidade não é erro de sistema: devolve as candidatas para a tela oferecer
    // "vincular a esta despesa" ou "são gastos diferentes".
    const suspeitas = (error as { suspeitas?: unknown })?.suspeitas;
    return NextResponse.json({ error: message, ...(suspeitas ? { suspeitas } : {}) }, { status: suspeitas ? 409 : 400 });
  }
}

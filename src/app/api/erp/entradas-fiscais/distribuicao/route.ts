import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/auth/session";
import { listNfeDistributionDocuments, refreshNfeDistributionDocuments, syncNfeDistribution } from "@/lib/services/nfe-distribution";

export async function GET() {
  try {
    const session = await requireModulo("entradas-fiscais");
    if (!session.scope) return NextResponse.json({ error: "Sessão sem empresa." }, { status: 401 });
    const documents = await listNfeDistributionDocuments(session.scope);
    return NextResponse.json({ documents });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível listar NF-e recebidas.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireModulo("entradas-fiscais");
    if (!session.scope) return NextResponse.json({ error: "Sessão sem empresa." }, { status: 401 });
    const body = await request.json().catch(() => ({})) as { ignoreWait?: boolean; mode?: string };
    const result = body.mode === "force-distribution" || body.mode === "history"
      ? await syncNfeDistribution(session.scope, { ignoreWait: Boolean(body.ignoreWait), fromStart: body.mode === "history" })
      : await refreshNfeDistributionDocuments(session.scope);
    const documents = await listNfeDistributionDocuments(session.scope);
    return NextResponse.json({ ...result, documents });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível sincronizar NF-e recebidas.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

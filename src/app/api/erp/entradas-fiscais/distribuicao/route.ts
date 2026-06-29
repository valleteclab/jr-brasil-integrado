import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { listNfeDistributionDocuments, processarDistribuicaoEmpresa, refreshNfeDistributionDocuments, syncNfeDistribution } from "@/lib/services/nfe-distribution";

/** Última vez que a distribuição foi sincronizada (cron ou manual) — para a UI mostrar "atualizado em". */
async function ultimaSync(empresaId: string): Promise<string | null> {
  const cfg = await prisma.configuracaoFiscal.findUnique({ where: { empresaId }, select: { distribuicaoSyncEm: true } });
  return cfg?.distribuicaoSyncEm?.toISOString() ?? null;
}

export async function GET() {
  try {
    const session = await requireModulo("entradas-fiscais");
    if (!session.scope) return NextResponse.json({ error: "Sessão sem empresa." }, { status: 401 });
    const documents = await listNfeDistributionDocuments(session.scope);
    return NextResponse.json({ documents, ultimaSync: await ultimaSync(session.scope.empresaId) });
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
    // "sync-now" (botão Atualizar agora): ciclo completo da empresa = sync por NSU + Ciência (210210).
    // "force-distribution"/"history": só o sync (history = do NSU 0). Default: refresh (re-sync SEFAZ).
    const result = body.mode === "sync-now"
      ? await processarDistribuicaoEmpresa(session.scope, { fromStart: false })
      : body.mode === "force-distribution" || body.mode === "history"
        ? await syncNfeDistribution(session.scope, { ignoreWait: Boolean(body.ignoreWait), fromStart: body.mode === "history" })
        : await refreshNfeDistributionDocuments(session.scope);
    const documents = await listNfeDistributionDocuments(session.scope);
    return NextResponse.json({ ...result, documents, ultimaSync: await ultimaSync(session.scope.empresaId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível sincronizar NF-e recebidas.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

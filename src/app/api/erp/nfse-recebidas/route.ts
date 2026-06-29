import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/auth/session";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { listNfseDistributionDocuments, syncNfseDistribution } from "@/lib/services/nfse-distribution";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function ultimaSync(empresaId: string): Promise<string | null> {
  const cfg = await prisma.configuracaoFiscal.findUnique({ where: { empresaId }, select: { nfseDistSyncEm: true } });
  return cfg?.nfseDistSyncEm?.toISOString() ?? null;
}

export async function GET(request: Request) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const papel = new URL(request.url).searchParams.get("papel");
    const filtro = papel === "PRESTADOR" || papel === "TOMADOR" ? papel : undefined;
    const documents = await listNfseDistributionDocuments(scope, filtro);
    return NextResponse.json({ documents, ultimaSync: await ultimaSync(scope.empresaId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível listar as NFS-e.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const result = await syncNfseDistribution(scope);
    const documents = await listNfseDistributionDocuments(scope);
    return NextResponse.json({ ...result, documents, ultimaSync: await ultimaSync(scope.empresaId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível sincronizar as NFS-e.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

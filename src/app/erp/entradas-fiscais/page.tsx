import { FiscalEntriesList } from "@/components/erp/FiscalEntriesList";
import { PageHeader } from "@/components/shared/PageHeader";
import { listFiscalEntrySummaries } from "@/lib/services/fiscal-entries";
import type { FiscalEntrySummary } from "@/lib/services/fiscal-entries";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { listNfeDistributionDocuments } from "@/lib/services/nfe-distribution";
import type { NfeDistributionSummary } from "@/lib/services/nfe-distribution";
import { listNfseDistributionDocuments } from "@/lib/services/nfse-distribution";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function FiscalEntriesPage({ searchParams }: { searchParams?: { lancada?: string } }) {
  const lancada = searchParams?.lancada ?? null;
  let entries: FiscalEntrySummary[] = [];
  let receivedDocuments: NfeDistributionSummary[] = [];
  let nfseRecebidas: Awaited<ReturnType<typeof listNfseDistributionDocuments>> = [];
  let ultimaSync: string | null = null;
  let nfseSync: string | null = null;
  let loadError = "";

  try {
    const scope = await getDevelopmentTenantScope();
    const [e, r, nfse, cfg] = await Promise.all([
      listFiscalEntrySummaries(),
      listNfeDistributionDocuments(scope),
      listNfseDistributionDocuments(scope, "TOMADOR"),
      prisma.configuracaoFiscal.findUnique({ where: { empresaId: scope.empresaId }, select: { distribuicaoSyncEm: true, nfseDistSyncEm: true } })
    ]);
    entries = e;
    receivedDocuments = r;
    nfseRecebidas = nfse;
    ultimaSync = cfg?.distribuicaoSyncEm?.toISOString() ?? null;
    nfseSync = cfg?.nfseDistSyncEm?.toISOString() ?? null;
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar notas fiscais de entrada.";
  }

  return (
    <>
      <PageHeader eyebrow="Suprimentos" title="Notas Fiscais de Entrada">
        <p>Acompanhe XMLs importados, notas registradas e vínculo dos itens ao estoque.</p>
      </PageHeader>
      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}
      <FiscalEntriesList
        entries={entries}
        receivedDocuments={receivedDocuments}
        ultimaSync={ultimaSync}
        nfseRecebidas={nfseRecebidas}
        nfseSync={nfseSync}
        lancada={lancada}
      />
    </>
  );
}

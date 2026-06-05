import { FiscalEntriesList } from "@/components/erp/FiscalEntriesList";
import { PageHeader } from "@/components/shared/PageHeader";
import { listFiscalEntrySummaries } from "@/lib/services/fiscal-entries";
import type { FiscalEntrySummary } from "@/lib/services/fiscal-entries";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { listNfeDistributionDocuments } from "@/lib/services/nfe-distribution";
import type { NfeDistributionSummary } from "@/lib/services/nfe-distribution";

export const dynamic = "force-dynamic";

export default async function FiscalEntriesPage() {
  let entries: FiscalEntrySummary[] = [];
  let receivedDocuments: NfeDistributionSummary[] = [];
  let loadError = "";

  try {
    const scope = await getDevelopmentTenantScope();
    [entries, receivedDocuments] = await Promise.all([
      listFiscalEntrySummaries(),
      listNfeDistributionDocuments(scope)
    ]);
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
      <FiscalEntriesList entries={entries} receivedDocuments={receivedDocuments} />
    </>
  );
}

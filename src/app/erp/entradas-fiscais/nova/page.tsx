import { FiscalEntryWizard } from "@/components/erp/FiscalEntryWizard";
import { getFiscalEntryDraft } from "@/domains/products/application/fiscal-entry-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { listErpProductSummaries } from "@/lib/services/products";

export const dynamic = "force-dynamic";

type NewFiscalEntryPageProps = {
  searchParams?: {
    id?: string;
  };
};

export default async function NewFiscalEntryPage({ searchParams }: NewFiscalEntryPageProps) {
  const products = await listErpProductSummaries();
  const initialDraft = searchParams?.id
    ? await getFiscalEntryDraft(await getDevelopmentTenantScope(), searchParams.id)
    : null;

  return <FiscalEntryWizard initialDraft={initialDraft} products={products} />;
}

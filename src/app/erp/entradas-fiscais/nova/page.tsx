import { FiscalEntryWizard } from "@/components/erp/FiscalEntryWizard";
import { getFiscalEntryDraft } from "@/domains/products/application/fiscal-entry-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { listProductPickerOptions } from "@/lib/services/products";

export const dynamic = "force-dynamic";

type NewFiscalEntryPageProps = {
  searchParams?: {
    id?: string;
  };
};

export default async function NewFiscalEntryPage({ searchParams }: NewFiscalEntryPageProps) {
  // Carrega o seletor de produtos (enxuto) e o draft em paralelo — a tela só
  // precisa de id/sku/nome para o matching, não do summary completo.
  const [products, initialDraft] = await Promise.all([
    listProductPickerOptions(),
    searchParams?.id
      ? getFiscalEntryDraft(await getDevelopmentTenantScope(), searchParams.id)
      : Promise.resolve(null)
  ]);

  return <FiscalEntryWizard initialDraft={initialDraft} products={products} />;
}

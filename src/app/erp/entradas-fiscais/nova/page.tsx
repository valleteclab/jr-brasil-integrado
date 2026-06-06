import { FiscalEntryWizard } from "@/components/erp/FiscalEntryWizard";
import { getFiscalEntryDraft } from "@/domains/products/application/fiscal-entry-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { listProductPickerOptions } from "@/lib/services/products";
import { listFormasPagamentoAtivas } from "@/domains/finance/application/payment-config-use-cases";

export const dynamic = "force-dynamic";

type NewFiscalEntryPageProps = {
  searchParams?: {
    id?: string;
  };
};

export default async function NewFiscalEntryPage({ searchParams }: NewFiscalEntryPageProps) {
  const scope = await getDevelopmentTenantScope();
  // Carrega o seletor de produtos (enxuto), as formas de pagamento cadastradas e o draft em
  // paralelo — a tela só precisa de id/sku/nome dos produtos para o matching.
  const [products, formasPagamento, initialDraft] = await Promise.all([
    listProductPickerOptions(),
    listFormasPagamentoAtivas(scope),
    searchParams?.id ? getFiscalEntryDraft(scope, searchParams.id) : Promise.resolve(null)
  ]);

  return (
    <FiscalEntryWizard
      initialDraft={initialDraft}
      products={products}
      formasPagamento={formasPagamento.map((f) => ({ id: f.id, nome: f.nome }))}
    />
  );
}

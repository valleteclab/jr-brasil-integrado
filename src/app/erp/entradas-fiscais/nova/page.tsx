import { FiscalEntryWizard } from "@/components/erp/FiscalEntryWizard";
import { getFiscalEntryDraft } from "@/domains/products/application/fiscal-entry-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { listProductPickerOptions } from "@/lib/services/products";
import { listFormasPagamentoAtivas } from "@/domains/finance/application/payment-config-use-cases";
import { listCodigosFiscais } from "@/lib/services/fiscal-codes";
import { getCompanySettings } from "@/lib/services/company-settings";

export const dynamic = "force-dynamic";

type NewFiscalEntryPageProps = {
  searchParams?: {
    id?: string;
  };
};

export default async function NewFiscalEntryPage({ searchParams }: NewFiscalEntryPageProps) {
  const scope = await getDevelopmentTenantScope();
  // Carrega o seletor de produtos (enxuto), as formas de pagamento cadastradas, a tabela de CFOP e
  // o draft em paralelo — a tela só precisa de id/sku/nome dos produtos para o matching.
  const [products, formasPagamento, cfops, initialDraft, companySettings] = await Promise.all([
    listProductPickerOptions(),
    listFormasPagamentoAtivas(scope),
    listCodigosFiscais("CFOP"),
    searchParams?.id ? getFiscalEntryDraft(scope, searchParams.id) : Promise.resolve(null),
    getCompanySettings(scope).catch(() => null)
  ]);

  // CFOPs de entrada (1xxx interno, 2xxx interestadual, 3xxx exterior) para o seletor — tabela
  // completa (CodigoFiscal), não a lista curta.
  const cfopsEntrada = cfops.filter((c) => /^[123]/.test(c.codigo));

  return (
    <FiscalEntryWizard
      initialDraft={initialDraft}
      products={products}
      formasPagamento={formasPagamento.map((f) => ({ id: f.id, nome: f.nome }))}
      cfopsEntrada={cfopsEntrada}
      margensPadrao={{
        vista: companySettings?.margemPadraoVistaPct ?? null,
        prazo: companySettings?.margemPadraoPrazoPct ?? null
      }}
    />
  );
}

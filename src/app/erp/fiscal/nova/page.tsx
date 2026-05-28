import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { NotaFiscalEmissao } from "@/components/erp/NotaFiscalEmissao";
import { listErpProductSummaries } from "@/lib/services/products";
import { listCustomerSummaries } from "@/lib/services/customers";
import type { ErpProductSummary } from "@/lib/services/products";
import type { CustomerSummary } from "@/lib/services/customers";

export const dynamic = "force-dynamic";

export default async function NovaNfePage() {
  let products: ErpProductSummary[] = [];
  let customers: CustomerSummary[] = [];
  let loadError = "";

  try {
    [products, customers] = await Promise.all([
      listErpProductSummaries(),
      listCustomerSummaries()
    ]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Erro ao carregar dados.";
  }

  return (
    <>
      <PageHeader
        eyebrow="Fiscal · Nova NF-e"
        title="Emitir Nota Fiscal Eletrônica"
        action={<Button href="/erp/fiscal" variant="light">← Voltar</Button>}
      >
        <p>
          Preencha cabeçalho, itens, pagamento e revise antes de salvar. Os tributos são calculados
          automaticamente pelo motor fiscal com base nos dados do produto.
        </p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}

      <NotaFiscalEmissao
        products={products}
        customers={customers}
        regimeEmpresa="REGIME_NORMAL"
        ufEmpresa="BA"
      />
    </>
  );
}

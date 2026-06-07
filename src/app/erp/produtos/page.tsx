import { ProductCrud } from "@/components/erp/ProductCrud";
import { PageHeader } from "@/components/shared/PageHeader";
import { listErpProductSummaries, listProductTaxRuleOptions, listProductCategories } from "@/lib/services/products";
import type { ErpProductSummary, ProductTaxRuleOption } from "@/lib/services/products";
import { listDepositos } from "@/lib/services/stock";
import { getEmpresaPerfil } from "@/domains/company/application/company-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export const dynamic = "force-dynamic";

function parseCurrency(value: string) {
  return Number(value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
}

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency"
  }).format(value);
}

export default async function ErpProductsPage() {
  let products: ErpProductSummary[] = [];
  let taxRules: ProductTaxRuleOption[] = [];
  let warehouses: string[] = [];
  let categories: string[] = [];
  let segmento = "GERAL";
  let loadError = "";

  try {
    products = await listErpProductSummaries();
    taxRules = await listProductTaxRuleOptions();
    warehouses = (await listDepositos()).map((deposito) => deposito.nome);
    categories = await listProductCategories();
    segmento = (await getEmpresaPerfil(await getDevelopmentTenantScope())).segmento;
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar produtos.";
  }

  const saleTotal = products.reduce((total, product) => total + parseCurrency(product.price) * product.availableStock, 0);
  const costTotal = products.reduce((total, product) => total + parseCurrency(product.costValue ?? "") * product.availableStock, 0);

  return (
    <>
      <PageHeader eyebrow="Cadastros" title="Produtos">
        <p>
          {products.length} SKUs cadastrados · Estoque a custo: {formatBrl(costTotal)} · Estoque a preço de venda: {formatBrl(saleTotal)}
        </p>
      </PageHeader>
      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}
      <ProductCrud initialProducts={products} taxRules={taxRules} warehouses={warehouses} categoryOptions={categories} segmento={segmento} />
    </>
  );
}

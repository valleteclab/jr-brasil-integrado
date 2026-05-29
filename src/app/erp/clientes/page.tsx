import { CustomersCrud } from "@/components/erp/CustomersCrud";
import { PageHeader } from "@/components/shared/PageHeader";
import { listCustomersDetailed, listTabelasPrecoOptions } from "@/lib/services/customers-admin";
import type { CustomerDetailedSummary, TabelaPrecoOption } from "@/lib/services/customers-admin";

export const dynamic = "force-dynamic";

export default async function ErpCustomersPage() {
  let customers: CustomerDetailedSummary[] = [];
  let tabelasPreco: TabelaPrecoOption[] = [];
  let loadError = "";

  try {
    [customers, tabelasPreco] = await Promise.all([
      listCustomersDetailed(),
      listTabelasPrecoOptions()
    ]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar clientes.";
  }

  return (
    <>
      <PageHeader eyebrow="Cadastros" title="Clientes B2B">
        <p>
          {customers.length} clientes cadastrados · Gerencie aprovação comercial, limite de crédito e condições de pagamento.
        </p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}

      <CustomersCrud initialCustomers={customers} tabelasPreco={tabelasPreco} />
    </>
  );
}

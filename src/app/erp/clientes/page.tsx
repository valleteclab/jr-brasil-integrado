import { CustomersCrud } from "@/components/erp/CustomersCrud";
import { PageHeader } from "@/components/shared/PageHeader";
import { listCustomersDetailed, listTabelasPrecoOptions } from "@/lib/services/customers-admin";
import type { CustomerDetailedSummary, TabelaPrecoOption } from "@/lib/services/customers-admin";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ErpCustomersPage() {
  const session = await getSession();
  // Perfil FINANCEIRO consulta crédito e libera venda faturada (o servidor também valida).
  const podeFinanceiro = Boolean(session?.modulos.includes("financeiro"));
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

      <CustomersCrud initialCustomers={customers} tabelasPreco={tabelasPreco} podeFinanceiro={podeFinanceiro} />
    </>
  );
}

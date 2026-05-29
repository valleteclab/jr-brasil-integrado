import { PageHeader } from "@/components/shared/PageHeader";
import { SaleForm } from "@/components/erp/SaleForm";
import { listSaleFormData } from "@/lib/services/sales";
import type { SaleFormData } from "@/lib/services/sales";

export const dynamic = "force-dynamic";

export default async function NovaVendaPage() {
  let formData: SaleFormData = { clientes: [], produtos: [] };
  let loadError = "";

  try {
    formData = await listSaleFormData();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar os dados do formulário.";
  }

  return (
    <>
      <PageHeader eyebrow="Vendas" title="Nova venda">
        <p>Preencha os dados abaixo para criar um novo pedido de venda.</p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Não foi possível carregar</strong>
          <span>{loadError}</span>
        </div>
      )}

      <SaleForm formData={formData} />
    </>
  );
}

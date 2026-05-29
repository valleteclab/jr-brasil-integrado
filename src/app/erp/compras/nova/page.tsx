import { PageHeader } from "@/components/shared/PageHeader";
import { PurchaseForm } from "@/components/erp/PurchaseForm";
import { listPurchaseFormData } from "@/lib/services/purchasing";
import type { PurchaseFormData } from "@/lib/services/purchasing";

export const dynamic = "force-dynamic";

export default async function NovoPedidoCompraPage() {
  let formData: PurchaseFormData = { fornecedores: [], produtos: [] };
  let loadError = "";

  try {
    formData = await listPurchaseFormData();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar dados do formulário.";
  }

  return (
    <>
      <PageHeader eyebrow="Compras" title="Novo pedido de compra">
        <p>Preencha os dados e adicione os itens do pedido</p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}

      {!loadError && <PurchaseForm formData={formData} />}
    </>
  );
}

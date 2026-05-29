import { PageHeader } from "@/components/shared/PageHeader";
import { SuppliersCrud } from "@/components/erp/SuppliersCrud";
import { listSuppliers } from "@/lib/services/purchasing";
import type { SupplierSummary } from "@/lib/services/purchasing";

export const dynamic = "force-dynamic";

export default async function FornecedoresPage() {
  let suppliers: SupplierSummary[] = [];
  let loadError = "";

  try {
    suppliers = await listSuppliers();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar fornecedores.";
  }

  const ativos = suppliers.filter((s) => s.ativo).length;

  return (
    <>
      <PageHeader eyebrow="Compras" title="Fornecedores">
        <p>{ativos} fornecedor{ativos !== 1 ? "es" : ""} ativo{ativos !== 1 ? "s" : ""} · {suppliers.length} no total</p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}

      <SuppliersCrud initialSuppliers={suppliers} />
    </>
  );
}

import { OrdemServicoForm } from "@/components/erp/OrdemServicoForm";
import { PageHeader } from "@/components/shared/PageHeader";
import { listOsFormData } from "@/lib/services/service-order";
import type { OsFormData } from "@/lib/services/service-order";

export const dynamic = "force-dynamic";

export default async function NovaOsPage() {
  let formData: OsFormData = { clientes: [], produtos: [] };
  let loadError = "";

  try {
    formData = await listOsFormData();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar dados do formulário.";
  }

  return (
    <>
      <PageHeader eyebrow="Ordens de Serviço" title="Nova OS">
        <p>Abra uma nova ordem de serviço informando o cliente e o equipamento.</p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}

      {!loadError && <OrdemServicoForm formData={formData} />}
    </>
  );
}

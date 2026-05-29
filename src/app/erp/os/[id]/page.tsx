import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { OrdemServicoDetail } from "@/components/erp/OrdemServicoDetail";
import { getOrdemServicoDetail, listOsFormData } from "@/lib/services/service-order";
import type { OrdemServicoDetail as OsDetail, OsFormData } from "@/lib/services/service-order";

export const dynamic = "force-dynamic";

type Props = {
  params: { id: string };
};

export default async function OrdemServicoPage({ params }: Props) {
  let os: OsDetail | null = null;
  let formData: OsFormData = { clientes: [], produtos: [] };
  let loadError = "";

  try {
    [os, formData] = await Promise.all([
      getOrdemServicoDetail(params.id),
      listOsFormData(),
    ]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar a OS.";
  }

  if (!loadError && !os) {
    notFound();
  }

  return (
    <>
      <PageHeader
        eyebrow="Ordens de Serviço"
        title={os ? `OS ${os.numero}` : "Ordem de Serviço"}
        action={<Button href="/erp/os" variant="light">← Voltar</Button>}
      >
        {os && (
          <p>
            {os.cliente} · {os.equipamento}
          </p>
        )}
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}

      {os && <OrdemServicoDetail os={os} formData={formData} />}
    </>
  );
}

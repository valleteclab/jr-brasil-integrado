import { PageHeader } from "@/components/shared/PageHeader";
import { NfseWizard } from "@/components/erp/NfseWizard";
import { getEmissaoFormData } from "@/lib/services/fiscal-emit";
import type { EmissaoFormData } from "@/lib/services/fiscal-emit";

export const dynamic = "force-dynamic";

export default async function EmitirNfsePage() {
  let data: EmissaoFormData | null = null;
  let loadError = "";

  try {
    data = await getEmissaoFormData();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar os dados de emissão.";
  }

  return (
    <>
      <PageHeader eyebrow="Fiscal / Emitir NFS-e" title="Emitir NFS-e">
        Emissão de Nota Fiscal de Serviço em etapas, no padrão do Emissor Nacional.
      </PageHeader>

      {loadError || !data ? (
        <div className="system-error">
          <strong>Não foi possível carregar a emissão</strong>
          <span>{loadError || "Dados de emissão indisponíveis."}</span>
        </div>
      ) : (
        <NfseWizard data={data} />
      )}
    </>
  );
}

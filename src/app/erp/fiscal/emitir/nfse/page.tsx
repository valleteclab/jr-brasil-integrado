import { PageHeader } from "@/components/shared/PageHeader";
import { NfseWizard } from "@/components/erp/NfseWizard";
import { getEmissaoFormData } from "@/lib/services/fiscal-emit";
import type { EmissaoFormData } from "@/lib/services/fiscal-emit";
import { getNotaFiscalPrefill, type EmissaoPrefill } from "@/lib/services/fiscal";

export const dynamic = "force-dynamic";

export default async function EmitirNfsePage({ searchParams }: { searchParams?: { clonar?: string } }) {
  let data: EmissaoFormData | null = null;
  let loadError = "";

  try {
    data = await getEmissaoFormData();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar os dados de emissão.";
  }

  // Clonar NFS-e: pré-preenche o wizard (tomador + descrição do serviço) a partir da nota original.
  let initial: EmissaoPrefill | null = null;
  let prefillError = "";
  if (searchParams?.clonar) {
    try {
      initial = await getNotaFiscalPrefill(searchParams.clonar, "CLONE");
    } catch (error) {
      prefillError = error instanceof Error ? error.message : "Não foi possível carregar a nota de origem.";
    }
  }

  return (
    <>
      <PageHeader eyebrow="Fiscal / Emitir NFS-e" title={initial ? "Clonar NFS-e" : "Emitir NFS-e"}>
        Emissão de Nota Fiscal de Serviço em etapas, no padrão do Emissor Nacional.
      </PageHeader>

      {prefillError && (
        <div className="alert danger" style={{ marginBottom: 14 }}>
          <strong>Não foi possível preparar a clonagem</strong>
          <span>{prefillError}</span>
        </div>
      )}

      {loadError || !data ? (
        <div className="system-error">
          <strong>Não foi possível carregar a emissão</strong>
          <span>{loadError || "Dados de emissão indisponíveis."}</span>
        </div>
      ) : (
        <NfseWizard data={data} initial={initial} />
      )}
    </>
  );
}

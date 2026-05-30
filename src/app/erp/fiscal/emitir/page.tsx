import { EmissaoAvulsaWorkspace } from "@/components/erp/EmissaoAvulsaWorkspace";
import { getEmissaoFormData } from "@/lib/services/fiscal-emit";
import type { EmissaoFormData } from "@/lib/services/fiscal-emit";

export const dynamic = "force-dynamic";

export default async function EmitirNotaPage() {
  let data: EmissaoFormData | null = null;
  let loadError = "";

  try {
    data = await getEmissaoFormData();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar os dados de emissão.";
  }

  if (loadError || !data) {
    return (
      <div className="system-error">
        <strong>Não foi possível carregar a emissão</strong>
        <span>{loadError || "Dados de emissão indisponíveis."}</span>
      </div>
    );
  }

  return <EmissaoAvulsaWorkspace data={data} />;
}

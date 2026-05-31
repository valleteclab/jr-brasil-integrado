import { CaixaWorkspace } from "@/components/erp/CaixaWorkspace";
import { getCaixaPageData, type CaixaPageData } from "@/lib/services/cashier";

export const dynamic = "force-dynamic";

export default async function CaixaPage() {
  let data: CaixaPageData | null = null;
  let loadError = "";
  try {
    data = await getCaixaPageData();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar o caixa.";
  }

  if (loadError || !data) {
    return (
      <div className="system-error">
        <strong>Não foi possível carregar o caixa</strong>
        <span>{loadError || "Dados indisponíveis."}</span>
      </div>
    );
  }

  return <CaixaWorkspace data={data} />;
}

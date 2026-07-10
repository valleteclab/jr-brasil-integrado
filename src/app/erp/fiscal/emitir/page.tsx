import { redirect } from "next/navigation";
import { EmissaoAvulsaWorkspace } from "@/components/erp/EmissaoAvulsaWorkspace";
import { EmissorSetupAviso } from "@/components/erp/EmissorSetupAviso";
import { getEmissaoFormData } from "@/lib/services/fiscal-emit";
import type { EmissaoFormData } from "@/lib/services/fiscal-emit";
import { getNotaFiscalPrefill, type EmissaoPrefill } from "@/lib/services/fiscal";

export const dynamic = "force-dynamic";

export default async function EmitirNotaPage({
  searchParams
}: {
  searchParams?: { clonar?: string; devolucao?: string };
}) {
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

  // Clonar nota ou gerar devolução: pré-preenche a tela a partir de uma nota existente.
  let initial: EmissaoPrefill | null = null;
  let prefillError = "";
  const clonarId = searchParams?.clonar;
  const devolucaoId = searchParams?.devolucao;
  try {
    if (devolucaoId) initial = await getNotaFiscalPrefill(devolucaoId, "DEVOLUCAO");
    else if (clonarId) initial = await getNotaFiscalPrefill(clonarId, "CLONE");
  } catch (error) {
    prefillError = error instanceof Error ? error.message : "Não foi possível carregar a nota de origem.";
  }

  // Clonar uma NFS-e (serviço) usa a tela própria de emissão de NFS-e (mesmo wizard de /emitir/nfse),
  // que pede a descrição do serviço — não a tela genérica de produtos.
  if (clonarId && initial?.tipo === "NFSE") {
    redirect(`/erp/fiscal/emitir/nfse?clonar=${clonarId}`);
  }

  return (
    <>
      <EmissorSetupAviso />
      {prefillError && (
        <div className="alert danger" style={{ marginBottom: 14 }}>
          <strong>Não foi possível preparar a operação</strong>
          <span>{prefillError}</span>
        </div>
      )}
      <EmissaoAvulsaWorkspace data={data} initial={initial} />
    </>
  );
}

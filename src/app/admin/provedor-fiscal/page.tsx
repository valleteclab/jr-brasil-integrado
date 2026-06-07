import { PageHeader } from "@/components/shared/PageHeader";
import { ProvedorFiscalForm } from "@/components/admin/ProvedorFiscalForm";
import { getProvedorFiscalPlataforma } from "@/lib/services/platform-admin";
import type { ProvedorFiscalPlataforma } from "@/lib/services/platform-admin";

export const dynamic = "force-dynamic";

export default async function AdminProvedorFiscalPage() {
  let dados: ProvedorFiscalPlataforma | null = null;
  let loadError = "";

  try {
    dados = await getProvedorFiscalPlataforma();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar o provedor fiscal.";
  }

  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Provedor de emissão fiscal">
        <p>
          Escolha o provedor de emissão usado pela plataforma e configure suas credenciais por ambiente
          (homologação/produção). As credenciais valem para <strong>todas</strong> as empresas.
        </p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Não foi possível carregar</strong>
          <span>{loadError}</span>
        </div>
      )}

      {dados && <ProvedorFiscalForm dados={dados} />}
    </>
  );
}

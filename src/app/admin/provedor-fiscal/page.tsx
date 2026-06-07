import { PageHeader } from "@/components/shared/PageHeader";
import { ProvedorFiscalForm } from "@/components/admin/ProvedorFiscalForm";
import { getProvedorFiscalPlataforma } from "@/lib/services/platform-admin";
import type { ProvedorFiscalAmbiente } from "@/lib/services/platform-admin";

export const dynamic = "force-dynamic";

export default async function AdminProvedorFiscalPage() {
  let ambientes: ProvedorFiscalAmbiente[] = [];
  let loadError = "";

  try {
    ambientes = (await getProvedorFiscalPlataforma()).ambientes;
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar o provedor fiscal.";
  }

  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Provedor de emissão fiscal">
        <p>
          Credenciais do provedor (ACBr) no nível da plataforma — usadas por <strong>todas</strong> as
          empresas. O client_id/client_secret são da APLICAÇÃO (não por empresa), separados por ambiente.
        </p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Não foi possível carregar</strong>
          <span>{loadError}</span>
        </div>
      )}

      {!loadError && <ProvedorFiscalForm ambientes={ambientes} />}
    </>
  );
}

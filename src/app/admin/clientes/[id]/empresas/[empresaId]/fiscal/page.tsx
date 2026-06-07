import { PageHeader } from "@/components/shared/PageHeader";
import { Card } from "@/components/shared/Card";
import { FiscalOnboardingWizard } from "@/components/erp/FiscalOnboardingWizard";
import { FiscalAdminAcoes } from "@/components/admin/FiscalAdminAcoes";
import { resolveEmpresaScope } from "@/lib/services/platform-admin";
import { getFiscalOnboardingData } from "@/domains/fiscal/application/fiscal-onboarding-use-cases";
import type { FiscalOnboardingData } from "@/domains/fiscal/application/fiscal-onboarding-use-cases";

export const dynamic = "force-dynamic";

export default async function AdminEmpresaFiscalPage({
  params
}: {
  params: { id: string; empresaId: string };
}) {
  let data: FiscalOnboardingData | null = null;
  let loadError = "";

  try {
    const scope = await resolveEmpresaScope(params.id, params.empresaId);
    data = await getFiscalOnboardingData(scope);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar a configuração fiscal.";
  }

  const apiBase = `/api/admin/clientes/${params.id}/empresas/${params.empresaId}/fiscal`;

  return (
    <>
      <PageHeader eyebrow="Plataforma · Fiscal" title="Onboarding fiscal do cliente">
        <p>Configure a base tributária, o certificado A1 e valide a emissão da empresa.</p>
      </PageHeader>

      {loadError || !data ? (
        <div className="system-error">
          <strong>Não foi possível carregar a configuração fiscal</strong>
          <span>{loadError || "Empresa não encontrada."}</span>
        </div>
      ) : (
        <>
          <FiscalOnboardingWizard initialData={data} apiBase={apiBase} />

          <section className="erp-card">
            <div className="erp-card-head">
              <div>
                <h3>Certificado e validação</h3>
                <span>Envie o certificado A1, teste a conexão e emita uma NF-e de teste em homologação.</span>
              </div>
            </div>
            <div style={{ padding: "0 16px 16px" }}>
              <FiscalAdminAcoes clienteId={params.id} empresaId={params.empresaId} />
            </div>
          </section>
        </>
      )}
    </>
  );
}

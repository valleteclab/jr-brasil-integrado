import { PageHeader } from "@/components/shared/PageHeader";
import { FiscalOnboardingWizard } from "@/components/erp/FiscalOnboardingWizard";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getFiscalOnboardingData } from "@/domains/fiscal/application/fiscal-onboarding-use-cases";
import type { FiscalOnboardingData } from "@/domains/fiscal/application/fiscal-onboarding-use-cases";

export const dynamic = "force-dynamic";

export default async function FiscalOnboardingPage() {
  let data: FiscalOnboardingData | null = null;
  let loadError = "";

  try {
    const scope = await getDevelopmentTenantScope();
    data = await getFiscalOnboardingData(scope);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar os dados fiscais.";
  }

  return (
    <>
      <PageHeader eyebrow="Configurações · Fiscal" title="Onboarding fiscal">
        <p>Configure a emissão em poucos passos. Ao final, geramos automaticamente a base tributária do seu regime — pronto para emitir NF-e, NFC-e e NFS-e.</p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Não foi possível carregar</strong>
          <span>{loadError}</span>
        </div>
      )}

      {data && <FiscalOnboardingWizard initialData={data} />}
    </>
  );
}

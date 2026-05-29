import { PageHeader } from "@/components/shared/PageHeader";
import { FiscalSettingsForm } from "@/components/erp/FiscalSettingsForm";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getFiscalConfig } from "@/domains/fiscal/application/fiscal-config-use-cases";
import type { FiscalConfigSummary } from "@/domains/fiscal/application/fiscal-config-use-cases";

export const dynamic = "force-dynamic";

export default async function FiscalSettingsPage() {
  let config: FiscalConfigSummary | null = null;
  let loadError = "";

  try {
    const scope = await getDevelopmentTenantScope();
    config = await getFiscalConfig(scope);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar a configuração fiscal.";
  }

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Emissão fiscal">
        <p>Defina o provedor, ambiente, regime tributário e numeração das notas fiscais.</p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Não foi possível carregar</strong>
          <span>{loadError}</span>
        </div>
      )}

      {config && <FiscalSettingsForm initialConfig={config} />}
    </>
  );
}

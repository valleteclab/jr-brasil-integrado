import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { FiscalSettingsForm } from "@/components/erp/FiscalSettingsForm";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getFiscalConfig } from "@/domains/fiscal/application/fiscal-config-use-cases";
import type { FiscalConfigSummary } from "@/domains/fiscal/application/fiscal-config-use-cases";
import { planoDoTenantAtual } from "@/lib/services/emissor-home";

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

  // Plano EMISSOR: tela enxuta — ambiente, regime, numeração NF-e/NFS-e, certificado A1 e logo.
  const emissor = ["EMISSOR", "CHAT"].includes(await planoDoTenantAtual());

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Emissão fiscal">
        <p>
          {emissor
            ? "Envie o certificado A1, escolha o ambiente e confira a numeração — é o que falta para emitir."
            : "Defina o provedor, ambiente, regime tributário e numeração das notas fiscais."}
        </p>
      </PageHeader>

      {!emissor && (
        <div className="alert info" style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span>
            <strong>Primeira configuração?</strong> Use o passo a passo guiado: ele preenche a identidade fiscal e
            gera automaticamente a base tributária do seu regime, deixando tudo pronto para emitir.
          </span>
          <Link className="button" href="/erp/configuracoes/fiscal/onboarding">Abrir onboarding fiscal</Link>
        </div>
      )}

      {loadError && (
        <div className="system-error">
          <strong>Não foi possível carregar</strong>
          <span>{loadError}</span>
        </div>
      )}

      {config && <FiscalSettingsForm initialConfig={config} simplificado={emissor} />}
    </>
  );
}

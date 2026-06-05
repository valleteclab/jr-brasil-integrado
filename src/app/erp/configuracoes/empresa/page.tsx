import { PageHeader } from "@/components/shared/PageHeader";
import { CompanySettingsForm } from "@/components/erp/CompanySettingsForm";
import { requireModulo } from "@/lib/auth/session";
import { getCompanySettings } from "@/lib/services/company-settings";

export const dynamic = "force-dynamic";

export default async function CompanySettingsPage() {
  let loadError = "";
  let settings = null;

  try {
    const session = await requireModulo("configuracoes");
    if (!session.scope) throw new Error("Sessão sem empresa selecionada.");
    settings = await getCompanySettings(session.scope);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar os dados da empresa.";
  }

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Dados da empresa">
        <p>Atualize os dados cadastrais, fiscais, endereço e contatos da empresa usada no ERP.</p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Não foi possível carregar</strong>
          <span>{loadError}</span>
        </div>
      )}

      {settings && <CompanySettingsForm initialSettings={settings} />}
    </>
  );
}

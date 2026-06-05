import { EmpresaSettingsForm } from "@/components/erp/EmpresaSettingsForm";
import { PageHeader } from "@/components/shared/PageHeader";
import { getEmpresaPerfil, type EmpresaPerfil } from "@/domains/company/application/company-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export const dynamic = "force-dynamic";

export default async function EmpresaSettingsPage() {
  let initial: EmpresaPerfil = { razaoSocial: "", nomeFantasia: null, tipoNegocio: "AMBOS", segmento: "GERAL" };
  let loadError = "";
  try {
    const scope = await getDevelopmentTenantScope();
    initial = await getEmpresaPerfil(scope);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar os dados da empresa.";
  }

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Dados da empresa">
        <p>Tipo de negócio da empresa — define o PDV recomendado e os módulos do menu.</p>
      </PageHeader>
      {loadError && (
        <div className="system-error"><strong>Banco indisponível</strong><span>{loadError}</span></div>
      )}
      <EmpresaSettingsForm initial={initial} />
    </>
  );
}

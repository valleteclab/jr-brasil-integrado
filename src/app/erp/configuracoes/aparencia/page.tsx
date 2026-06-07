import { PageHeader } from "@/components/shared/PageHeader";
import { AparenciaForm } from "@/components/erp/AparenciaForm";
import { getBranding } from "@/domains/company/application/branding-use-cases";
import { getEmpresaPerfil } from "@/domains/company/application/company-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export const dynamic = "force-dynamic";

export default async function AparenciaPage() {
  let initial = { logoSistema: null as string | null, corDestaque: null as string | null, slugLoja: null as string | null };
  let nomeSugerido = "";
  let loadError = "";

  try {
    const scope = await getDevelopmentTenantScope();
    const [branding, perfil] = await Promise.all([getBranding(scope), getEmpresaPerfil(scope)]);
    initial = branding;
    nomeSugerido = perfil.nomeFantasia ?? perfil.razaoSocial ?? "";
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar a aparência.";
  }

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Aparência">
        <p>
          Personalize a identidade visual do sistema desta empresa: a logo exibida na barra lateral e
          a cor de destaque (botões, links e menu ativo). Não confunda com a logo fiscal do DANFE
          (essa fica em Emissão fiscal).
        </p>
      </PageHeader>
      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}
      <AparenciaForm initial={initial} nomeSugerido={nomeSugerido} />
    </>
  );
}

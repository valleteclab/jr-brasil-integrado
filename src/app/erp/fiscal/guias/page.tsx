import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { GuiasWorkspace } from "@/components/erp/GuiasWorkspace";
import { listGuias } from "@/domains/fiscal/application/guia-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { ModuloBloqueado } from "@/components/erp/ModuloBloqueado";
import { moduloLiberadoNoScope } from "@/lib/auth/tenant-features";

export const dynamic = "force-dynamic";

export default async function GuiasPage() {
  if (!(await moduloLiberadoNoScope("fiscalHabilitado"))) return <ModuloBloqueado titulo="Fiscal indisponível" />;

  const scope = await getDevelopmentTenantScope();
  const guias = await listGuias(scope);

  return (
    <>
      <PageHeader
        eyebrow="Fiscal · Recolhimentos estaduais"
        title="Guias GNRE a recolher"
        action={<Button href="/erp/fiscal" variant="light">← Documentos fiscais</Button>}
      >
        <p>
          NF-e interestadual em que a empresa reteve ICMS-ST (contribuinte substituto, Conv. ICMS
          142/2018) gera aqui a guia pendente para a UF de destino. Recolha ANTES da saída da
          mercadoria — a via da GNRE acompanha o transporte — e registre o pagamento.
        </p>
      </PageHeader>
      <GuiasWorkspace guias={guias} />
    </>
  );
}

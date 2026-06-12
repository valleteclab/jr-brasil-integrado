import { WhatsappSettings } from "@/components/erp/WhatsappSettings";
import { PageHeader } from "@/components/shared/PageHeader";
import { ModuloBloqueado } from "@/components/erp/ModuloBloqueado";
import { moduloLiberadoNoScope } from "@/lib/auth/tenant-features";

export const dynamic = "force-dynamic";

export default async function WhatsappSettingsPage() {
  if (!(await moduloLiberadoNoScope("whatsappHabilitado"))) return <ModuloBloqueado titulo="WhatsApp indisponível" />;

  return (
    <>
      <PageHeader eyebrow="Configurações" title="WhatsApp (Agente)">
        <p>Conecte a Z-API e autorize os telefones que operam o agente pelo WhatsApp.</p>
      </PageHeader>
      <WhatsappSettings />
    </>
  );
}

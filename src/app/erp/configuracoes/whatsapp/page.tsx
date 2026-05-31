import { WhatsappSettings } from "@/components/erp/WhatsappSettings";
import { PageHeader } from "@/components/shared/PageHeader";

export const dynamic = "force-dynamic";

export default function WhatsappSettingsPage() {
  return (
    <>
      <PageHeader eyebrow="Configurações" title="WhatsApp (Agente)">
        <p>Conecte a Z-API e autorize os telefones que operam o agente pelo WhatsApp.</p>
      </PageHeader>
      <WhatsappSettings />
    </>
  );
}

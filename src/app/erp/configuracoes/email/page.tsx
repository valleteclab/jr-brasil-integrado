import { EmailSettings } from "@/components/erp/EmailSettings";
import { PageHeader } from "@/components/shared/PageHeader";

export const dynamic = "force-dynamic";

export default async function EmailSettingsPage() {
  return (
    <>
      <PageHeader eyebrow="Configurações" title="E-mail (envio de documentos)">
        <p>Configure o SMTP da empresa para enviar orçamentos, boletos e notas fiscais ao cliente.</p>
      </PageHeader>
      <EmailSettings />
    </>
  );
}

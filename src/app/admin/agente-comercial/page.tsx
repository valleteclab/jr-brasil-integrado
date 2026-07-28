import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { CommercialAgentSettings } from "@/components/admin/CommercialAgentSettings";

export const dynamic = "force-dynamic";

export default function AdminAgenteComercialPage() {
  return (
    <>
      <PageHeader
        eyebrow="Comercial"
        title="Agente de vendas"
        action={<Button href="/admin/leads" variant="light">Ver leads</Button>}
      >
        <p>Número, inteligência e regras do assistente que atende interessados no XERP.</p>
      </PageHeader>
      <CommercialAgentSettings />
    </>
  );
}

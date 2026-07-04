import { AiSettingsForm } from "@/components/erp/AiSettingsForm";
import { AgentApiKeys } from "@/components/erp/AgentApiKeys";
import { AgentPhones } from "@/components/erp/AgentPhones";
import { PageHeader } from "@/components/shared/PageHeader";
import { getAiConfig } from "@/domains/ai/openrouter-service";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { ModuloBloqueado } from "@/components/erp/ModuloBloqueado";
import { moduloLiberado } from "@/lib/auth/tenant-features";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  const scope = await getDevelopmentTenantScope();
  if (!(await moduloLiberado(scope, "iaHabilitada"))) return <ModuloBloqueado titulo="IA do ERP indisponível" />;

  const config = await getAiConfig(scope);

  return (
    <>
      <PageHeader eyebrow="Configurações" title="IA do ERP">
        <p>Configure a chave OpenRouter desta empresa para recursos assistidos por IA.</p>
      </PageHeader>
      <AiSettingsForm initialConfig={config} />
      <AgentPhones />
      <AgentApiKeys />
    </>
  );
}

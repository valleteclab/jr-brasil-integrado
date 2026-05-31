import { AiSettingsForm } from "@/components/erp/AiSettingsForm";
import { AgentApiKeys } from "@/components/erp/AgentApiKeys";
import { PageHeader } from "@/components/shared/PageHeader";
import { getAiConfig } from "@/domains/ai/openrouter-service";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  const scope = await getDevelopmentTenantScope();
  const config = await getAiConfig(scope);

  return (
    <>
      <PageHeader eyebrow="Configurações" title="IA do ERP">
        <p>Configure a chave OpenRouter desta empresa para recursos assistidos por IA.</p>
      </PageHeader>
      <AiSettingsForm initialConfig={config} />
      <AgentApiKeys />
    </>
  );
}

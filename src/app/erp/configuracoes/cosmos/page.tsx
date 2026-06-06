import { PageHeader } from "@/components/shared/PageHeader";
import { CosmosConfigForm } from "@/components/erp/CosmosConfigForm";
import { getCosmosConfig } from "@/domains/products/application/cosmos-service";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export const dynamic = "force-dynamic";

export default async function CosmosConfigPage() {
  let initial = { configurado: false, ativo: false, chaveFinal: null as string | null };
  let loadError = "";

  try {
    const config = await getCosmosConfig(await getDevelopmentTenantScope());
    initial = { configurado: config.configurado, ativo: config.ativo, chaveFinal: config.chaveFinal };
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar a configuração do Cosmos.";
  }

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Catálogo Cosmos (código de barras)">
        <p>
          Conecte o catálogo Cosmos (Bluesoft) para buscar produtos por código de barras (GTIN/EAN)
          e preencher descrição, NCM, CEST e marca automaticamente no cadastro de produtos e na
          entrada de notas. O token fica criptografado e é usado apenas no servidor.
        </p>
      </PageHeader>
      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}
      <CosmosConfigForm initial={initial} />
    </>
  );
}

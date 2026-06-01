import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { ClientesTable } from "@/components/admin/ClientesTable";
import { listClientes } from "@/lib/services/platform-admin";
import type { ClienteSummary } from "@/lib/services/platform-admin";

export const dynamic = "force-dynamic";

export default async function AdminClientesPage() {
  let clientes: ClienteSummary[] = [];
  let loadError = "";

  try {
    clientes = await listClientes();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar os clientes.";
  }

  return (
    <>
      <PageHeader
        eyebrow="Plataforma"
        title="Clientes"
        action={<Button href="/admin/clientes/novo">Novo cliente</Button>}
      >
        <p>{clientes.length} clientes (tenants) cadastrados.</p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}

      {!loadError && <ClientesTable clientes={clientes} />}
    </>
  );
}

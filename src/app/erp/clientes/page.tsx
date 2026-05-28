import { DataTable } from "@/components/erp/DataTable";
import { Button } from "@/components/shared/Button";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { listCustomerSummaries } from "@/lib/services/customers";
import type { CustomerSummary } from "@/lib/services/customers";

export const dynamic = "force-dynamic";

type BadgeTone = "success" | "warn" | "danger" | "info" | "violet" | "mute";

function customerTone(status: string): BadgeTone {
  if (status === "ATIVO") {
    return "success";
  }

  if (status === "PENDENTE_APROVACAO") {
    return "warn";
  }

  if (status === "BLOQUEADO") {
    return "danger";
  }

  return "mute";
}

function customerLabel(status: string) {
  const labels: Record<string, string> = {
    ATIVO: "Ativo",
    PENDENTE_APROVACAO: "Pendente de aprovação",
    BLOQUEADO: "Bloqueado",
    INATIVO: "Inativo"
  };

  return labels[status] ?? status;
}

export default async function ErpCustomersPage() {
  let customers: CustomerSummary[] = [];
  let loadError = "";

  try {
    customers = await listCustomerSummaries();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar clientes.";
  }

  return (
    <>
      <PageHeader
        eyebrow="Cadastros"
        title="Clientes B2B"
        action={<Button>Novo cliente</Button>}
      >
        <p>Gerencie cadastros, aprovação comercial, limite de crédito e condições de pagamento.</p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}

      <section className="panel">
        <div className="erp-toolbar">
          <strong>{customers.length} clientes</strong>
          <span>Controle comercial para atendimento, pedidos e faturamento.</span>
        </div>
        <DataTable
          headers={["Cliente", "Documento", "Segmento", "Limite", "Uso", "Condição", "Status"]}
          isEmpty={!customers.length}
        >
          {customers.map((customer) => (
            <tr key={customer.id}>
              <td>{customer.name}</td>
              <td className="mono">{customer.document}</td>
              <td>{customer.segment ?? "Sem segmento"}</td>
              <td className="numeric">{customer.creditLimit}</td>
              <td className="numeric">{customer.creditUsed}</td>
              <td>{customer.paymentTerms ?? "A definir"}</td>
              <td>
                <StatusBadge tone={customerTone(customer.status)}>{customerLabel(customer.status)}</StatusBadge>
              </td>
            </tr>
          ))}
        </DataTable>
      </section>
    </>
  );
}

import { PageHeader } from "@/components/shared/PageHeader";
import { NovoClienteForm } from "@/components/admin/NovoClienteForm";

export const dynamic = "force-dynamic";

export default function AdminNovoClientePage() {
  return (
    <>
      <PageHeader eyebrow="Plataforma · Clientes" title="Novo cliente">
        <p>Provisione um novo cliente (tenant) com a empresa matriz e o usuário administrador.</p>
      </PageHeader>

      <NovoClienteForm />
    </>
  );
}

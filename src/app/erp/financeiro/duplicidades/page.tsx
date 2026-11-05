import { PageHeader } from "@/components/shared/PageHeader";
import { DuplicidadesManager } from "@/components/erp/DuplicidadesManager";
import { listarDespesasDuplicadas } from "@/domains/finance/application/buscar-duplicidade-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { ModuloBloqueado } from "@/components/erp/ModuloBloqueado";
import { moduloLiberadoNoScope } from "@/lib/auth/tenant-features";

export const dynamic = "force-dynamic";

export default async function DuplicidadesPage() {
  if (!(await moduloLiberadoNoScope("financeiroHabilitado"))) return <ModuloBloqueado titulo="Financeiro indisponível" />;

  const scope = await getDevelopmentTenantScope();
  const pares = await listarDespesasDuplicadas(scope);

  return (
    <section className="erp-page">
      <PageHeader eyebrow="Financeiro" title="Despesas duplicadas">
        A mesma despesa pode entrar pelo extrato, pela nota de entrada e pela NFS-e. Aqui aparecem os pares que
        provavelmente são o mesmo gasto.
      </PageHeader>
      <DuplicidadesManager paresIniciais={pares} />
    </section>
  );
}

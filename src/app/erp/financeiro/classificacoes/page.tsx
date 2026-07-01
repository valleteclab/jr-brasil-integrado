import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { ClassificacoesManager } from "@/components/erp/ClassificacoesManager";
import { listClassificacoes, GRUPOS_ORDEM } from "@/domains/finance/application/classificacao-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { ModuloBloqueado } from "@/components/erp/ModuloBloqueado";
import { moduloLiberadoNoScope } from "@/lib/auth/tenant-features";

export const dynamic = "force-dynamic";

export default async function ClassificacoesPage() {
  if (!(await moduloLiberadoNoScope("financeiroHabilitado"))) return <ModuloBloqueado titulo="Financeiro indisponível" />;

  const scope = await getDevelopmentTenantScope();
  const classificacoes = await listClassificacoes(scope, { incluirInativas: true });

  return (
    <>
      <PageHeader
        eyebrow="Financeiro · Classificações"
        title="Plano de classificações financeiras"
        action={<Button href="/erp/financeiro" variant="light">← Voltar ao financeiro</Button>}
      >
        <p>
          Categorize as contas a pagar/receber por classificação (ex.: Mercadoria para revenda, Salários,
          Combustível) e defina a meta mensal (IDEAL) de cada uma — é o que alimenta o
          <strong> Fechamento mensal</strong> nos relatórios.
        </p>
      </PageHeader>
      <ClassificacoesManager initial={classificacoes} gruposSugeridos={GRUPOS_ORDEM} />
    </>
  );
}

import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { ExtratoBancarioWorkspace } from "@/components/erp/ExtratoBancarioWorkspace";
import { listConfigCobranca } from "@/domains/finance/application/boleto-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { ModuloBloqueado } from "@/components/erp/ModuloBloqueado";
import { moduloLiberadoNoScope } from "@/lib/auth/tenant-features";

export const dynamic = "force-dynamic";

export default async function ExtratoBancarioPage() {
  if (!(await moduloLiberadoNoScope("financeiroHabilitado"))) return <ModuloBloqueado titulo="Financeiro indisponível" />;

  const scope = await getDevelopmentTenantScope();
  const contas = (await listConfigCobranca(scope)).filter((c) => c.configurada);

  return (
    <>
      <PageHeader
        eyebrow="Financeiro · Banco"
        title="Extrato e conciliação bancária"
        action={<Button href="/erp/financeiro" variant="light">← Voltar ao financeiro</Button>}
      >
        <p>
          Aba <strong>Extrato do banco</strong>: somente as transações reais da conta (extrato puro do Sicoob).
          Aba <strong>Conciliação bancária</strong>: banco × ERP — o que bateu, o que só está no banco
          (tarifas, crédito de antecipação) e o que só está no ERP.
        </p>
      </PageHeader>
      <ExtratoBancarioWorkspace contas={contas.map((c) => ({ id: c.id, nome: c.nome, temContaCorrente: Boolean(c.sicoobContaCorrente) }))} />
    </>
  );
}

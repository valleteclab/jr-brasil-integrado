import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { AntecipacaoWorkspace } from "@/components/erp/AntecipacaoWorkspace";
import { listAntecipacoes, listTitulosAntecipaveis } from "@/domains/finance/application/antecipacao-use-cases";
import { listBankAccounts } from "@/lib/services/finance";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { ModuloBloqueado } from "@/components/erp/ModuloBloqueado";
import { moduloLiberadoNoScope } from "@/lib/auth/tenant-features";

export const dynamic = "force-dynamic";

export default async function AntecipacaoPage() {
  if (!(await moduloLiberadoNoScope("financeiroHabilitado"))) return <ModuloBloqueado titulo="Financeiro indisponível" />;

  const scope = await getDevelopmentTenantScope();
  const [titulos, historico, contas] = await Promise.all([
    listTitulosAntecipaveis(scope),
    listAntecipacoes(scope),
    listBankAccounts()
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Financeiro · Antecipação"
        title="Antecipação de recebíveis"
        action={<Button href="/erp/financeiro" variant="light">← Voltar ao financeiro</Button>}
      >
        <p>
          Antecipou boletos/recebíveis no banco ou factoring? Selecione os títulos e informe a taxa:
          o sistema baixa os títulos pelo valor bruto, credita a conta, e lança a taxa como despesa
          financeira (<strong>Juros de antecipação</strong>) — o fechamento mensal e o DRE batem sem
          lançamento manual.
        </p>
      </PageHeader>
      <AntecipacaoWorkspace titulos={titulos} historico={historico} contas={contas} />
    </>
  );
}

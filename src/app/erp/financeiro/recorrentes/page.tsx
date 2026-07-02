import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { RecorrentesWorkspace } from "@/components/erp/RecorrentesWorkspace";
import { listRecorrencias } from "@/domains/finance/application/recorrencia-use-cases";
import { listClassificacoes } from "@/domains/finance/application/classificacao-use-cases";
import { listFormasPagamentoAtivas } from "@/domains/finance/application/payment-config-use-cases";
import { listBankAccounts } from "@/lib/services/finance";
import { prisma } from "@/lib/db/prisma";
import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { ModuloBloqueado } from "@/components/erp/ModuloBloqueado";
import { moduloLiberadoNoScope } from "@/lib/auth/tenant-features";

export const dynamic = "force-dynamic";

export default async function RecorrentesPage() {
  if (!(await moduloLiberadoNoScope("financeiroHabilitado"))) return <ModuloBloqueado titulo="Financeiro indisponível" />;

  const scope = await getDevelopmentTenantScope();
  const [recorrencias, contas, classificacoes, formas, fornecedores] = await Promise.all([
    listRecorrencias(scope),
    listBankAccounts(),
    listClassificacoes(scope),
    listFormasPagamentoAtivas(scope),
    prisma.fornecedor.findMany({
      where: { ...scopedByTenantCompany(scope), ativo: true },
      orderBy: { razaoSocial: "asc" },
      select: { id: true, razaoSocial: true }
    })
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Financeiro · Recorrências"
        title="Despesas recorrentes"
        action={<Button href="/erp/financeiro" variant="light">← Voltar ao financeiro</Button>}
      >
        <p>
          Folha salarial, aluguel, energia, contador, assinaturas… cadastre uma vez e as contas a
          pagar de cada competência são geradas automaticamente. Despesa de valor variável entra
          como estimativa e o valor real é informado na baixa.
        </p>
      </PageHeader>
      <RecorrentesWorkspace
        recorrencias={recorrencias}
        fornecedores={fornecedores.map((f) => ({ id: f.id, nome: f.razaoSocial }))}
        contas={contas.map((c) => ({ id: c.id, nome: c.nome }))}
        classificacoes={classificacoes.map((c) => ({ id: c.id, nome: c.nome, grupo: c.grupo, tipo: c.tipo }))}
        formas={formas.map((f) => ({ id: f.id, nome: f.nome }))}
      />
    </>
  );
}

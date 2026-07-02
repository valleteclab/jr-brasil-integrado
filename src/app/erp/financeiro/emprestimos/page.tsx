import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { EmprestimosWorkspace } from "@/components/erp/EmprestimosWorkspace";
import { listEmprestimos } from "@/domains/finance/application/emprestimo-use-cases";
import { listClassificacoes } from "@/domains/finance/application/classificacao-use-cases";
import { listBankAccounts } from "@/lib/services/finance";
import { prisma } from "@/lib/db/prisma";
import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { ModuloBloqueado } from "@/components/erp/ModuloBloqueado";
import { moduloLiberadoNoScope } from "@/lib/auth/tenant-features";

export const dynamic = "force-dynamic";

export default async function EmprestimosPage() {
  if (!(await moduloLiberadoNoScope("financeiroHabilitado"))) return <ModuloBloqueado titulo="Financeiro indisponível" />;

  const scope = await getDevelopmentTenantScope();
  const [emprestimos, contas, classificacoes, fornecedores] = await Promise.all([
    listEmprestimos(scope),
    listBankAccounts(),
    listClassificacoes(scope),
    prisma.fornecedor.findMany({
      where: { ...scopedByTenantCompany(scope), ativo: true },
      orderBy: { razaoSocial: "asc" },
      select: { id: true, razaoSocial: true }
    })
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Financeiro · Contratos"
        title="Empréstimos e financiamentos"
        action={<Button href="/erp/financeiro" variant="light">← Voltar ao financeiro</Button>}
      >
        <p>
          Cadastre o contrato (PRICE, SAC ou parcela do carnê) e o sistema calcula o cronograma —
          juros, amortização e saldo devedor. As parcelas em aberto entram no contas a pagar;
          contratos antigos entram informando as parcelas já quitadas.
        </p>
      </PageHeader>
      <EmprestimosWorkspace
        emprestimos={emprestimos}
        fornecedores={fornecedores.map((f) => ({ id: f.id, nome: f.razaoSocial }))}
        contas={contas.map((c) => ({ id: c.id, nome: c.nome }))}
        classificacoes={classificacoes.map((c) => ({ id: c.id, nome: c.nome, grupo: c.grupo, tipo: c.tipo }))}
      />
    </>
  );
}

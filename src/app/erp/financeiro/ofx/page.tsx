import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { ExtratoOfxWorkspace } from "@/components/erp/ExtratoOfxWorkspace";
import { prisma } from "@/lib/db/prisma";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { ModuloBloqueado } from "@/components/erp/ModuloBloqueado";
import { moduloLiberadoNoScope } from "@/lib/auth/tenant-features";

export const dynamic = "force-dynamic";

/** Importação do extrato bancário / fatura de cartão em OFX e conciliação com os títulos. */
export default async function ExtratoOfxPage() {
  if (!(await moduloLiberadoNoScope("financeiroHabilitado"))) return <ModuloBloqueado titulo="Financeiro indisponível" />;

  const scope = await getDevelopmentTenantScope();
  const [contas, fornecedores, clientes, classificacoes] = await Promise.all([
    prisma.contaBancaria.findMany({
      where: { tenantId: scope.tenantId, empresaId: scope.empresaId, ativo: true },
      select: { id: true, nome: true, tipo: true },
      orderBy: { nome: "asc" }
    }),
    prisma.fornecedor.findMany({
      where: { tenantId: scope.tenantId, empresaId: scope.empresaId, ativo: true },
      select: { id: true, razaoSocial: true, nomeFantasia: true },
      orderBy: { razaoSocial: "asc" },
      take: 500
    }),
    prisma.cliente.findMany({
      where: { tenantId: scope.tenantId, empresaId: scope.empresaId, status: "ATIVO" },
      select: { id: true, razaoSocial: true, nomeFantasia: true },
      orderBy: { razaoSocial: "asc" },
      take: 500
    }),
    prisma.classificacaoFinanceira
      .findMany({
        where: { tenantId: scope.tenantId, empresaId: scope.empresaId, ativo: true },
        select: { id: true, nome: true, tipo: true },
        orderBy: { nome: "asc" }
      })
      .catch(() => [])
  ]);

  const nome = (p: { razaoSocial: string; nomeFantasia: string | null }) => p.nomeFantasia || p.razaoSocial;

  return (
    <>
      <PageHeader
        eyebrow="Financeiro · Conciliação"
        title="Importar extrato (OFX)"
        action={<Button href="/erp/financeiro" variant="light">← Contas a pagar/receber</Button>}
      >
        <p>
          Exporte o extrato (ou a fatura do cartão) em <strong>OFX</strong> no internet banking e importe aqui. O sistema
          casa cada lançamento com os títulos em aberto de mesmo valor e data próxima — e <strong>não lança nada
          sozinho</strong>: o que não casar fica pendente para você vincular ou ignorar. Reimportar o mesmo período não duplica.
        </p>
      </PageHeader>

      {contas.length === 0 ? (
        <div className="erp-card" style={{ padding: 20 }}>
          Cadastre uma conta financeira antes de importar o extrato —{" "}
          <a href="/erp/configuracoes/contas-financeiras">Contas financeiras</a>.
        </div>
      ) : (
        <ExtratoOfxWorkspace
          contas={contas}
          fornecedores={fornecedores.map((f) => ({ id: f.id, nome: nome(f) }))}
          clientes={clientes.map((c) => ({ id: c.id, nome: nome(c) }))}
          classificacoes={classificacoes}
        />
      )}
    </>
  );
}

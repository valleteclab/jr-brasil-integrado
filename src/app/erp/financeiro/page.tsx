import { PageHeader } from "@/components/shared/PageHeader";
import { KpiCard } from "@/components/shared/KpiCard";
import { FinanceManager } from "@/components/erp/FinanceManager";
import { listPayables, listReceivables, listBankAccounts, getFinanceSummary, listActiveClienteOptions, listMaquinasCartaoOptions } from "@/lib/services/finance";
import type { PayableSummary, ReceivableSummary, BankAccountSummary, FinanceSummary, ClienteOption, MaquinaCartaoOption } from "@/lib/services/finance";
import { listFormasPagamentoAtivas } from "@/domains/finance/application/payment-config-use-cases";
import { listClassificacoes } from "@/domains/finance/application/classificacao-use-cases";
import { Button } from "@/components/shared/Button";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession } from "@/lib/auth/session";
import { isAdminPerfil } from "@/lib/auth/modules";
import { ModuloBloqueado } from "@/components/erp/ModuloBloqueado";
import { moduloLiberadoNoScope } from "@/lib/auth/tenant-features";

export const dynamic = "force-dynamic";

export default async function FinanceiroPage() {
  if (!(await moduloLiberadoNoScope("financeiroHabilitado"))) return <ModuloBloqueado titulo="Financeiro indisponível" />;

  let payables: PayableSummary[] = [];
  let receivables: ReceivableSummary[] = [];
  let bankAccounts: BankAccountSummary[] = [];
  let summary: FinanceSummary | null = null;
  let formasPagamento: Array<{ id: string; nome: string }> = [];
  let clientes: ClienteOption[] = [];
  let maquinas: MaquinaCartaoOption[] = [];
  let classificacoes: Array<{ id: string; nome: string; grupo: string; tipo: "DESPESA" | "RECEITA" }> = [];
  let loadError = "";

  try {
    const scope = await getDevelopmentTenantScope();
    const [pay, rec, banks, sum, formas, cli, maqs, classes] = await Promise.all([
      listPayables(),
      listReceivables(),
      listBankAccounts(),
      getFinanceSummary(),
      listFormasPagamentoAtivas(scope),
      listActiveClienteOptions(),
      listMaquinasCartaoOptions(),
      listClassificacoes(scope)
    ]);
    payables = pay;
    receivables = rec;
    bankAccounts = banks;
    summary = sum;
    formasPagamento = formas.map((f) => ({ id: f.id, nome: f.nome }));
    clientes = cli;
    maquinas = maqs;
    classificacoes = classes.map((c) => ({ id: c.id, nome: c.nome, grupo: c.grupo, tipo: c.tipo }));
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar o módulo financeiro.";
  }

  const session = await getSession();
  const isAdmin = isAdminPerfil(session?.perfilNome ?? "");

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        title="Contas a Pagar e Receber"
        action={
          <span style={{ display: "inline-flex", gap: 8 }}>
            <Button href="/erp/financeiro/antecipacao" variant="light">Antecipação de recebíveis</Button>
            <Button href="/erp/financeiro/classificacoes" variant="light">Plano de classificações</Button>
          </span>
        }
      >
        <p>Gerencie pagamentos, recebimentos e saldos bancários</p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}

      {summary && (
        <div className="kpi-row">
          <KpiCard
            label="A Receber (aberto)"
            value={summary.totalAReceber}
            tone="success"
          />
          <KpiCard
            label="A Pagar (aberto)"
            value={summary.totalAPagar}
            tone="warn"
          />
          <KpiCard
            label="Vencidos a Receber"
            value={summary.vencidosAReceber}
            tone={summary.vencidosAReceberNumber > 0 ? "danger" : "default"}
          />
          <KpiCard
            label="Vencidos a Pagar"
            value={summary.vencidosAPagar}
            tone={summary.vencidosAPagarNumber > 0 ? "danger" : "default"}
          />
          <KpiCard
            label="Saldo em Contas"
            value={summary.saldoContas}
            tone={summary.saldoContasNumber >= 0 ? "info" : "danger"}
          />
        </div>
      )}

      {!loadError && (
        <FinanceManager
          initialPayables={payables}
          initialReceivables={receivables}
          bankAccounts={bankAccounts}
          formasPagamento={formasPagamento}
          clientes={clientes}
          maquinas={maquinas}
          classificacoes={classificacoes}
          isAdmin={isAdmin}
        />
      )}
    </>
  );
}

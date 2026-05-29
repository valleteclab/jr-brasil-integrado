import { PageHeader } from "@/components/shared/PageHeader";
import { KpiCard } from "@/components/shared/KpiCard";
import { FinanceManager } from "@/components/erp/FinanceManager";
import { listPayables, listReceivables, listBankAccounts, getFinanceSummary } from "@/lib/services/finance";
import type { PayableSummary, ReceivableSummary, BankAccountSummary, FinanceSummary } from "@/lib/services/finance";

export const dynamic = "force-dynamic";

export default async function FinanceiroPage() {
  let payables: PayableSummary[] = [];
  let receivables: ReceivableSummary[] = [];
  let bankAccounts: BankAccountSummary[] = [];
  let summary: FinanceSummary | null = null;
  let loadError = "";

  try {
    [payables, receivables, bankAccounts, summary] = await Promise.all([
      listPayables(),
      listReceivables(),
      listBankAccounts(),
      getFinanceSummary()
    ]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar o módulo financeiro.";
  }

  return (
    <>
      <PageHeader eyebrow="Financeiro" title="Contas a Pagar e Receber">
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
        />
      )}
    </>
  );
}

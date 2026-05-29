import { PageHeader } from "@/components/shared/PageHeader";
import { KpiCard } from "@/components/shared/KpiCard";
import { StockManager } from "@/components/erp/StockManager";
import {
  listStockBalances,
  listStockMovements,
  listInventories,
  listDepositos,
  listProdutosOptions
} from "@/lib/services/stock";
import type { StockBalance, StockMovement, InventorySummary, DepositoOption, ProdutoOption } from "@/lib/services/stock";
import { formatBrl } from "@/lib/formatters/currency";

export const dynamic = "force-dynamic";

export default async function EstoquePage() {
  let balances: StockBalance[] = [];
  let movements: StockMovement[] = [];
  let inventories: InventorySummary[] = [];
  let depositos: DepositoOption[] = [];
  let produtos: ProdutoOption[] = [];
  let loadError = "";

  try {
    [balances, movements, inventories, depositos, produtos] = await Promise.all([
      listStockBalances(),
      listStockMovements(100),
      listInventories(),
      listDepositos(),
      listProdutosOptions()
    ]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar dados de estoque.";
  }

  const totalCusto = balances.reduce((sum, b) => sum + b.custoMedio * b.quantidade, 0);
  const itensZerados = balances.filter((b) => b.status === "Zerado").length;
  const itensCriticos = balances.filter((b) => b.status === "Crítico").length;
  const totalSKUs = new Set(balances.map((b) => b.produtoId)).size;

  return (
    <>
      <PageHeader
        eyebrow="Operações"
        title="Estoque"
        action={undefined}
      >
        <p>Saldos por depósito, movimentações e inventários da empresa.</p>
      </PageHeader>

      <div className="kpi-row">
        <KpiCard label="SKUs com saldo" value={String(totalSKUs)} tone="default" />
        <KpiCard label="Valor total a custo" value={formatBrl(totalCusto)} tone="info" />
        <KpiCard label="Itens críticos" value={String(itensCriticos)} tone={itensCriticos > 0 ? "warn" : "default"} />
        <KpiCard label="Itens zerados" value={String(itensZerados)} tone={itensZerados > 0 ? "danger" : "default"} />
      </div>

      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}

      <StockManager
        balances={balances}
        movements={movements}
        inventories={inventories}
        depositos={depositos}
        produtos={produtos}
      />
    </>
  );
}

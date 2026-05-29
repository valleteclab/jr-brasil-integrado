import { PageHeader } from "@/components/shared/PageHeader";
import { KpiCard } from "@/components/shared/KpiCard";
import { PurchaseList } from "@/components/erp/PurchaseList";
import { listPurchaseOrders } from "@/lib/services/purchasing";
import type { PurchaseOrderSummary } from "@/lib/services/purchasing";

export const dynamic = "force-dynamic";

function parseBrl(value: string) {
  return Number(value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
}

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(value);
}

export default async function ComprasPage() {
  let orders: PurchaseOrderSummary[] = [];
  let loadError = "";

  try {
    orders = await listPurchaseOrders();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar pedidos de compra.";
  }

  const abertos = orders.filter((o) => o.status === "RASCUNHO" || o.status === "ENVIADO").length;
  const aReceber = orders.filter((o) => o.status === "ENVIADO" || o.status === "PARCIAL").length;
  const valorAberto = orders
    .filter((o) => o.status !== "CANCELADO" && o.status !== "RECEBIDO")
    .reduce((sum, o) => sum + parseBrl(o.total), 0);

  return (
    <>
      <PageHeader eyebrow="Compras" title="Pedidos de compra">
        <p>{orders.length} pedido{orders.length !== 1 ? "s" : ""} no total</p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}

      <div className="kpi-row">
        <KpiCard label="Pedidos em aberto" value={String(abertos)} tone={abertos > 0 ? "info" : "default"} />
        <KpiCard label="Aguardando recebimento" value={String(aReceber)} tone={aReceber > 0 ? "warn" : "default"} />
        <KpiCard label="Valor em aberto" value={formatBrl(valorAberto)} tone={valorAberto > 0 ? "info" : "default"} />
      </div>

      <PurchaseList initialOrders={orders} />
    </>
  );
}

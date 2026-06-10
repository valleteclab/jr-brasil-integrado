import { KpiCard } from "@/components/shared/KpiCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { SalesList } from "@/components/erp/SalesList";
import { listSales } from "@/lib/services/sales";
import type { SaleSummary } from "@/lib/services/sales";
import { getSession } from "@/lib/auth/session";
import { isAdminPerfil } from "@/lib/auth/modules";

export const dynamic = "force-dynamic";

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default async function VendasPage() {
  let sales: SaleSummary[] = [];
  let loadError = "";

  try {
    sales = await listSales();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar vendas.";
  }

  const session = await getSession();
  const isAdmin = isAdminPerfil(session?.perfilNome ?? "");

  const abertos = sales.filter((s) =>
    ["RASCUNHO", "AGUARDANDO_PAGAMENTO", "AGUARDANDO_NOTA", "SEPARACAO"].includes(s.status)
  );

  const faturados = sales.filter((s) => s.status === "ENVIADO" || s.status === "ENTREGUE");

  const valorEmAberto = abertos
    .filter((s) => s.status === "AGUARDANDO_NOTA" || s.status === "AGUARDANDO_PAGAMENTO")
    .reduce((sum, s) => sum + s.totalNumber, 0);

  return (
    <>
      <PageHeader
        eyebrow="Operacional"
        title="Vendas"
        action={
          <span style={{ display: "inline-flex", gap: 8 }}>
            <a className="btn-erp ghost sm" href="/erp/vendas/vendedores">Vendedores</a>
            <a className="btn-erp ghost sm" href="/erp/vendas/comissoes">Comissões</a>
          </span>
        }
      >
        <p>{sales.length} pedidos registrados</p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Não foi possível carregar</strong>
          <span>{loadError}</span>
        </div>
      )}

      <div className="kpi-row">
        <KpiCard
          label="Pedidos em aberto"
          value={String(abertos.length)}
          tone="info"
        />
        <KpiCard
          label="Faturados (total)"
          value={String(faturados.length)}
          tone="success"
        />
        <KpiCard
          label="Valor em aberto"
          value={formatBrl(valorEmAberto)}
          tone={valorEmAberto > 0 ? "warn" : "default"}
        />
      </div>

      <SalesList sales={sales} isAdmin={isAdmin} />
    </>
  );
}

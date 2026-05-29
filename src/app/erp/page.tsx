import { KpiCard } from "@/components/shared/KpiCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { getDashboardData } from "@/lib/services/dashboard";

export const dynamic = "force-dynamic";

function statusPedidoLabel(status: string): string {
  const map: Record<string, string> = {
    RASCUNHO: "Rascunho",
    AGUARDANDO_PAGAMENTO: "Ag. Pagamento",
    AGUARDANDO_NOTA: "Ag. Nota",
    SEPARACAO: "Separação",
    ENVIADO: "Enviado",
    ENTREGUE: "Entregue",
    CANCELADO: "Cancelado"
  };
  return map[status] ?? status;
}

function statusPedidoTone(status: string): "success" | "warn" | "danger" | "info" | "violet" | "mute" {
  const map: Record<string, "success" | "warn" | "danger" | "info" | "violet" | "mute"> = {
    RASCUNHO: "mute",
    AGUARDANDO_PAGAMENTO: "warn",
    AGUARDANDO_NOTA: "info",
    SEPARACAO: "violet",
    ENVIADO: "success",
    ENTREGUE: "success",
    CANCELADO: "danger"
  };
  return map[status] ?? "mute";
}

export default async function ErpDashboardPage() {
  let data;
  let loadError = "";

  try {
    data = await getDashboardData();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar o dashboard.";
  }

  if (loadError || !data) {
    return (
      <>
        <PageHeader eyebrow="Backoffice integrado" title="Dashboard operacional" />
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError || "Erro desconhecido ao carregar dados."}</span>
        </div>
      </>
    );
  }

  const { vendasMes, aReceberAberto, aPagarAberto, notasAutorizadasMes, itensCriticos, pedidosRecentes, osAbertas, erros } = data;

  return (
    <>
      <PageHeader eyebrow="Backoffice integrado" title="Dashboard operacional" />

      {erros.length > 0 && (
        <div className="alert warn" style={{ marginBottom: "1rem" }}>
          <strong>Atenção:</strong> alguns módulos retornaram erro — dados parciais podem estar sendo exibidos.
          <ul style={{ margin: "0.25rem 0 0 1rem", fontSize: "0.85em" }}>
            {erros.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* KPIs */}
      <div className="kpi-row">
        <KpiCard
          label="Vendas no mês"
          value={vendasMes ? vendasMes.total : "—"}
          tone={vendasMes && vendasMes.totalNum > 0 ? "success" : "default"}
        />
        <KpiCard
          label="A receber (aberto)"
          value={aReceberAberto ? aReceberAberto.total : "—"}
          tone={aReceberAberto && aReceberAberto.totalNum > 0 ? "info" : "default"}
        />
        <KpiCard
          label="A pagar (aberto)"
          value={aPagarAberto ? aPagarAberto.total : "—"}
          tone={aPagarAberto && aPagarAberto.totalNum > 0 ? "warn" : "default"}
        />
        <KpiCard
          label="NF-e autorizadas no mês"
          value={notasAutorizadasMes ? `${notasAutorizadasMes.contagem} · ${notasAutorizadasMes.valor}` : "—"}
          tone={notasAutorizadasMes && notasAutorizadasMes.contagem > 0 ? "success" : "default"}
        />
        <KpiCard
          label="Estoque crítico"
          value={itensCriticos ? `${itensCriticos.contagem} SKUs` : "—"}
          tone={itensCriticos && itensCriticos.contagem > 0 ? "danger" : "success"}
        />
        <KpiCard
          label="OS em aberto"
          value={osAbertas ? String(osAbertas.contagem) : "—"}
          tone={osAbertas && osAbertas.contagem > 0 ? "warn" : "success"}
        />
      </div>

      {/* Itens críticos de estoque */}
      <section className="erp-card" style={{ marginTop: "1.5rem" }}>
        <div className="erp-card-head"><h3>Itens críticos de estoque</h3></div>
        {!itensCriticos || itensCriticos.top5.length === 0 ? (
          <div className="empty-st">
            <span>Nenhum item com estoque crítico no momento.</span>
          </div>
        ) : (
          <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Produto</th>
                <th>Saldo atual</th>
                <th>Mínimo</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {itensCriticos.top5.map((item) => (
                <tr key={item.id}>
                  <td><code>{item.sku}</code></td>
                  <td>{item.nome}</td>
                  <td>{item.saldoAtual}</td>
                  <td>{item.minimo}</td>
                  <td>
                    <StatusBadge tone={item.saldoAtual <= 0 ? "danger" : "warn"}>
                      {item.saldoAtual <= 0 ? "Zerado" : "Crítico"}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        {itensCriticos && itensCriticos.contagem > 5 && (
          <p style={{ fontSize: "0.85em", marginTop: "0.5rem", color: "var(--text-2)" }}>
            {itensCriticos.contagem - 5} outros itens críticos não exibidos.{" "}
            <a href="/erp/estoque" className="toolbar-link">Ver estoque completo</a>
          </p>
        )}
      </section>

      {/* Pedidos recentes */}
      <section className="erp-card" style={{ marginTop: "1.5rem" }}>
        <div className="erp-card-head"><h3>Pedidos recentes</h3></div>
        {!pedidosRecentes || pedidosRecentes.length === 0 ? (
          <div className="empty-st">
            <span>Nenhum pedido registrado ainda.</span>
          </div>
        ) : (
          <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Número</th>
                <th>Cliente</th>
                <th>Status</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {pedidosRecentes.map((pedido) => (
                <tr key={pedido.id}>
                  <td><code>{pedido.numero}</code></td>
                  <td>{pedido.cliente}</td>
                  <td>
                    <StatusBadge tone={statusPedidoTone(pedido.status)}>
                      {statusPedidoLabel(pedido.status)}
                    </StatusBadge>
                  </td>
                  <td>{pedido.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        <p style={{ fontSize: "0.85em", marginTop: "0.5rem" }}>
          <a href="/erp/vendas" className="toolbar-link">Ver todas as vendas</a>
        </p>
      </section>

      {/* OS abertas */}
      {osAbertas && osAbertas.contagem > 0 && (
        <section className="erp-card" style={{ marginTop: "1.5rem" }}>
          <div className="erp-card-head"><h3>Ordens de serviço em aberto</h3></div>
          <p>
            Há <strong>{osAbertas.contagem}</strong> ordem{osAbertas.contagem !== 1 ? "s" : ""} de serviço não faturada{osAbertas.contagem !== 1 ? "s" : ""}.{" "}
            <a href="/erp/os" className="toolbar-link">Gerenciar OS</a>
          </p>
        </section>
      )}
    </>
  );
}

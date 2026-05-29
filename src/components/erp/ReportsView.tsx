"use client";

import { useState } from "react";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { SalesReport, StockReport, FinanceReport, FiscalReport, DreSimplificado } from "@/lib/services/reports";

type Tab = "vendas" | "estoque" | "financeiro" | "fiscal" | "dre";

const TABS: { id: Tab; label: string }[] = [
  { id: "vendas", label: "Vendas" },
  { id: "estoque", label: "Estoque" },
  { id: "financeiro", label: "Financeiro" },
  { id: "fiscal", label: "Fiscal" },
  { id: "dre", label: "DRE" }
];

type Props = {
  sales: SalesReport;
  stock: StockReport;
  finance: FinanceReport;
  fiscal: FiscalReport;
  dre: DreSimplificado;
};

// ─── Aba Vendas ───────────────────────────────────────────────────────────────

function AbaVendas({ data }: { data: SalesReport }) {
  return (
    <div>
      <div className="kpi-row">
        <KpiCard label="Total do período" value={data.totalGeral} tone="success" />
        <KpiCard label="Pedidos" value={String(data.contagem)} tone="info" />
        <KpiCard label="Ticket médio" value={data.ticketMedio} tone="default" />
      </div>

      <section className="erp-card" style={{ marginTop: "1.5rem" }}>
        <div className="erp-card-head"><h3>Top 10 produtos mais vendidos ({data.periodoDias} dias)</h3></div>
        {data.topProdutos.length === 0 ? (
          <div className="empty-st"><span>Sem vendas no período.</span></div>
        ) : (
          <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>#</th>
                <th>SKU</th>
                <th>Produto</th>
                <th>Qtd. vendida</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.topProdutos.map((p, i) => (
                <tr key={p.produtoId}>
                  <td>{i + 1}</td>
                  <td><code>{p.sku}</code></td>
                  <td>{p.nome}</td>
                  <td>{p.quantidadeTotal}</td>
                  <td>{p.totalVendidoFmt}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>

      <section className="erp-card" style={{ marginTop: "1.5rem" }}>
        <div className="erp-card-head"><h3>Vendas por dia ({data.periodoDias} dias)</h3></div>
        {data.vendasPorDia.length === 0 ? (
          <div className="empty-st"><span>Sem dados de venda por dia.</span></div>
        ) : (
          <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Pedidos</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.vendasPorDia.map((d) => (
                <tr key={d.data}>
                  <td>{d.data}</td>
                  <td>{d.contagem}</td>
                  <td>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Aba Estoque ──────────────────────────────────────────────────────────────

function AbaEstoque({ data }: { data: StockReport }) {
  return (
    <div>
      <div className="kpi-row">
        <KpiCard label="Valor em estoque (custo)" value={data.valorTotalEstoque} tone="info" />
        <KpiCard label="Total de SKUs" value={String(data.totalSkus)} tone="default" />
        <KpiCard label="Itens críticos" value={String(data.totalCriticos)} tone={data.totalCriticos > 0 ? "warn" : "success"} />
        <KpiCard label="Itens zerados" value={String(data.totalZerados)} tone={data.totalZerados > 0 ? "danger" : "success"} />
      </div>

      <section className="erp-card" style={{ marginTop: "1.5rem" }}>
        <div className="erp-card-head"><h3>Valor de estoque por categoria</h3></div>
        {data.porCategoria.length === 0 ? (
          <div className="empty-st"><span>Nenhum saldo de estoque registrado.</span></div>
        ) : (
          <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>SKUs</th>
                <th>Valor a custo</th>
              </tr>
            </thead>
            <tbody>
              {data.porCategoria.map((cat) => (
                <tr key={cat.categoria}>
                  <td>{cat.categoria}</td>
                  <td>{cat.totalItens}</td>
                  <td>{cat.valorCusto}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>

      {data.itensCriticos.length > 0 && (
        <section className="erp-card" style={{ marginTop: "1.5rem" }}>
          <div className="erp-card-head"><h3>Itens com estoque crítico</h3></div>
          <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Produto</th>
                <th>Categoria</th>
                <th>Saldo</th>
                <th>Mínimo</th>
                <th>Valor custo</th>
              </tr>
            </thead>
            <tbody>
              {data.itensCriticos.map((item) => (
                <tr key={item.sku}>
                  <td><code>{item.sku}</code></td>
                  <td>{item.nome}</td>
                  <td>{item.categoria}</td>
                  <td>{item.saldoAtual}</td>
                  <td>{item.minimo}</td>
                  <td>{item.valorCusto}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      )}

      {data.itensZerados.length > 0 && (
        <section className="erp-card" style={{ marginTop: "1.5rem" }}>
          <div className="erp-card-head"><h3>Itens zerados</h3></div>
          <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Produto</th>
                <th>Categoria</th>
              </tr>
            </thead>
            <tbody>
              {data.itensZerados.map((item) => (
                <tr key={item.sku}>
                  <td><code>{item.sku}</code></td>
                  <td>{item.nome}</td>
                  <td>{item.categoria}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Aba Financeiro ───────────────────────────────────────────────────────────

function statusFinanceiroLabel(s: string): string {
  const map: Record<string, string> = {
    ABERTO: "Aberto",
    PARCIAL: "Parcial",
    VENCIDO: "Vencido",
    PAGO: "Pago",
    CANCELADO: "Cancelado"
  };
  return map[s] ?? s;
}

function statusFinanceiroTone(s: string): "success" | "warn" | "danger" | "info" | "mute" {
  const map: Record<string, "success" | "warn" | "danger" | "info" | "mute"> = {
    ABERTO: "info",
    PARCIAL: "warn",
    VENCIDO: "danger",
    PAGO: "success",
    CANCELADO: "mute"
  };
  return map[s] ?? "mute";
}

function AbaFinanceiro({ data }: { data: FinanceReport }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        {/* A Receber */}
        <div>
          <h3 style={{ marginBottom: "0.75rem" }}>A Receber</h3>
          <div className="kpi-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <KpiCard label="Total em aberto" value={data.aReceber.totalAberto} tone="info" />
            <KpiCard label="Total vencido" value={data.aReceber.totalVencido} tone={data.aReceber.totalVencidoNum > 0 ? "danger" : "success"} />
          </div>

          <section className="erp-card" style={{ marginTop: "1rem" }}>
            <div className="erp-card-head"><h3>Por status</h3></div>
            {data.aReceber.porStatus.length === 0 ? (
              <div className="empty-st"><span>Sem contas a receber.</span></div>
            ) : (
              <div className="erp-table-wrap">
              <table className="erp-table">
                <thead>
                  <tr><th>Status</th><th>Qtd.</th><th>Total</th></tr>
                </thead>
                <tbody>
                  {data.aReceber.porStatus.map((r) => (
                    <tr key={r.status}>
                      <td><StatusBadge tone={statusFinanceiroTone(r.status)}>{statusFinanceiroLabel(r.status)}</StatusBadge></td>
                      <td>{r.contagem}</td>
                      <td>{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </section>

          <section className="erp-card" style={{ marginTop: "1rem" }}>
            <div className="erp-card-head"><h3>Aging (vencimentos)</h3></div>
            {data.aReceber.aging.length === 0 ? (
              <div className="empty-st"><span>Sem pendências.</span></div>
            ) : (
              <div className="erp-table-wrap">
              <table className="erp-table">
                <thead>
                  <tr><th>Faixa</th><th>Qtd.</th><th>Total</th></tr>
                </thead>
                <tbody>
                  {data.aReceber.aging.map((r) => (
                    <tr key={r.faixa}>
                      <td>{r.faixa}</td>
                      <td>{r.contagem}</td>
                      <td>{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </section>
        </div>

        {/* A Pagar */}
        <div>
          <h3 style={{ marginBottom: "0.75rem" }}>A Pagar</h3>
          <div className="kpi-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <KpiCard label="Total em aberto" value={data.aPagar.totalAberto} tone="warn" />
            <KpiCard label="Total vencido" value={data.aPagar.totalVencido} tone={data.aPagar.totalVencidoNum > 0 ? "danger" : "success"} />
          </div>

          <section className="erp-card" style={{ marginTop: "1rem" }}>
            <div className="erp-card-head"><h3>Por status</h3></div>
            {data.aPagar.porStatus.length === 0 ? (
              <div className="empty-st"><span>Sem contas a pagar.</span></div>
            ) : (
              <div className="erp-table-wrap">
              <table className="erp-table">
                <thead>
                  <tr><th>Status</th><th>Qtd.</th><th>Total</th></tr>
                </thead>
                <tbody>
                  {data.aPagar.porStatus.map((r) => (
                    <tr key={r.status}>
                      <td><StatusBadge tone={statusFinanceiroTone(r.status)}>{statusFinanceiroLabel(r.status)}</StatusBadge></td>
                      <td>{r.contagem}</td>
                      <td>{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </section>

          <section className="erp-card" style={{ marginTop: "1rem" }}>
            <div className="erp-card-head"><h3>Aging (vencimentos)</h3></div>
            {data.aPagar.aging.length === 0 ? (
              <div className="empty-st"><span>Sem pendências.</span></div>
            ) : (
              <div className="erp-table-wrap">
              <table className="erp-table">
                <thead>
                  <tr><th>Faixa</th><th>Qtd.</th><th>Total</th></tr>
                </thead>
                <tbody>
                  {data.aPagar.aging.map((r) => (
                    <tr key={r.faixa}>
                      <td>{r.faixa}</td>
                      <td>{r.contagem}</td>
                      <td>{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── Aba Fiscal ───────────────────────────────────────────────────────────────

function statusNotaLabel(s: string): string {
  const map: Record<string, string> = {
    RASCUNHO: "Rascunho",
    ENVIADA: "Enviada",
    AUTORIZADA: "Autorizada",
    REJEITADA: "Rejeitada",
    CANCELADA: "Cancelada",
    DENEGADA: "Denegada",
    INUTILIZADA: "Inutilizada"
  };
  return map[s] ?? s;
}

function statusNotaTone(s: string): "success" | "warn" | "danger" | "info" | "mute" {
  const map: Record<string, "success" | "warn" | "danger" | "info" | "mute"> = {
    RASCUNHO: "mute",
    ENVIADA: "info",
    AUTORIZADA: "success",
    REJEITADA: "danger",
    CANCELADA: "danger",
    DENEGADA: "danger",
    INUTILIZADA: "warn"
  };
  return map[s] ?? "mute";
}

function AbaFiscal({ data }: { data: FiscalReport }) {
  return (
    <div>
      <div className="kpi-row">
        <KpiCard label={`Notas em ${data.mes}`} value={String(data.totalNotas)} tone="info" />
        <KpiCard label="Valor total" value={data.totalValor} tone="success" />
        <KpiCard label="Total tributos" value={data.totalTributos} tone="warn" />
      </div>

      <section className="erp-card" style={{ marginTop: "1.5rem" }}>
        <div className="erp-card-head"><h3>Notas fiscais — {data.mes}</h3></div>
        {data.linhas.length === 0 ? (
          <div className="empty-st"><span>Nenhuma nota fiscal emitida neste mês.</span></div>
        ) : (
          <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Modelo</th>
                <th>Status</th>
                <th>Qtd.</th>
                <th>Valor total</th>
                <th>Tributos</th>
              </tr>
            </thead>
            <tbody>
              {data.linhas.map((linha) => (
                <tr key={`${linha.modelo}-${linha.status}`}>
                  <td><code>{linha.modelo}</code></td>
                  <td><StatusBadge tone={statusNotaTone(linha.status)}>{statusNotaLabel(linha.status)}</StatusBadge></td>
                  <td>{linha.contagem}</td>
                  <td>{linha.valorTotal}</td>
                  <td>{linha.tributos}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Aba DRE ──────────────────────────────────────────────────────────────────

function AbaDre({ data }: { data: DreSimplificado }) {
  const resultadoCaixaPositivo = data.resultadoCaixaNum >= 0;
  const resultadoCompPositivo = data.resultadoCompetenciaNum >= 0;

  return (
    <div>
      <div className="alert warn" style={{ marginBottom: "1rem" }}>
        <strong>DRE gerencial simplificado — {data.periodoDias} dias.</strong>{" "}
        Regime de caixa e competência lado a lado. Não substitui demonstrativo contábil formal.
        Premissas: receita caixa = ContaReceber pago; receita competência = NF-e autorizada;
        CMV = saídas de estoque; despesas = ContaPagar pago. Sem depreciação, IR/CSLL ou encargos.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        {/* Regime de Caixa */}
        <div>
          <h3 style={{ marginBottom: "0.75rem" }}>Regime de Caixa</h3>
          <table className="erp-table">
            <tbody>
              <tr>
                <td><strong>Receita bruta</strong></td>
                <td>{data.receitaCaixaFmt}</td>
              </tr>
              <tr>
                <td>(-) CMV</td>
                <td>{data.cmvFmt}</td>
              </tr>
              <tr>
                <td><strong>Lucro bruto</strong></td>
                <td>
                  <strong>{data.lucroBrutoCaixaFmt}</strong>
                  <small style={{ marginLeft: "0.5em", color: "var(--text-2)" }}>({data.margemBrutaCaixa})</small>
                </td>
              </tr>
              <tr>
                <td>(-) Despesas operacionais</td>
                <td>{data.despesasFmt}</td>
              </tr>
              <tr style={{ fontWeight: "bold" }}>
                <td>Resultado líquido</td>
                <td>
                  <StatusBadge tone={resultadoCaixaPositivo ? "success" : "danger"}>
                    {data.resultadoCaixaFmt}
                  </StatusBadge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Regime de Competência */}
        <div>
          <h3 style={{ marginBottom: "0.75rem" }}>Regime de Competência</h3>
          <table className="erp-table">
            <tbody>
              <tr>
                <td><strong>Receita bruta</strong></td>
                <td>{data.receitaCompetenciaFmt}</td>
              </tr>
              <tr>
                <td>(-) CMV</td>
                <td>{data.cmvFmt}</td>
              </tr>
              <tr>
                <td><strong>Lucro bruto</strong></td>
                <td>
                  <strong>{data.lucroBrutoCompetenciaFmt}</strong>
                  <small style={{ marginLeft: "0.5em", color: "var(--text-2)" }}>({data.margemBrutoCompetencia})</small>
                </td>
              </tr>
              <tr>
                <td>(-) Despesas operacionais</td>
                <td>{data.despesasFmt}</td>
              </tr>
              <tr style={{ fontWeight: "bold" }}>
                <td>Resultado líquido</td>
                <td>
                  <StatusBadge tone={resultadoCompPositivo ? "success" : "danger"}>
                    {data.resultadoCompetenciaFmt}
                  </StatusBadge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ReportsView({ sales, stock, finance, fiscal, dre }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("vendas");

  return (
    <div>
      {/* Tabs */}
      <nav className="tabs" style={{ marginBottom: "1.5rem" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Conteúdo */}
      {activeTab === "vendas" && <AbaVendas data={sales} />}
      {activeTab === "estoque" && <AbaEstoque data={stock} />}
      {activeTab === "financeiro" && <AbaFinanceiro data={finance} />}
      {activeTab === "fiscal" && <AbaFiscal data={fiscal} />}
      {activeTab === "dre" && <AbaDre data={dre} />}
    </div>
  );
}

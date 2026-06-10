"use client";

import { useState } from "react";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { AccountingPackageReport, ApuracaoImpostosReport, SalesReport, StockReport, FinanceReport, FiscalReport, DreSimplificado } from "@/lib/services/reports";
import type { LivroEntradasReport } from "@/lib/services/livro-entradas";

type Tab = "vendas" | "estoque" | "financeiro" | "fiscal" | "dre" | "contabil" | "apuracao" | "entradas";

const TABS: { id: Tab; label: string }[] = [
  { id: "vendas", label: "Vendas" },
  { id: "estoque", label: "Estoque" },
  { id: "financeiro", label: "Financeiro" },
  { id: "fiscal", label: "Fiscal" },
  { id: "dre", label: "DRE" },
  { id: "contabil", label: "Pacote contábil" },
  { id: "apuracao", label: "Apuração de impostos" },
  { id: "entradas", label: "Livro de entradas" }
];

type Props = {
  sales: SalesReport;
  stock: StockReport;
  finance: FinanceReport;
  fiscal: FiscalReport;
  dre: DreSimplificado;
  accounting: AccountingPackageReport;
  apuracao: ApuracaoImpostosReport;
  livroEntradas: LivroEntradasReport;
  accountingParams: { mes?: number; ano?: number };
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

// ─── Aba Pacote Contábil ──────────────────────────────────────────────────────

function exportHref(kind: "html" | "csv" | "xml", params: { mes?: number; ano?: number }): string {
  const qs = new URLSearchParams();
  if (params.mes) qs.set("mes", String(params.mes));
  if (params.ano) qs.set("ano", String(params.ano));
  const query = qs.toString();
  return `/api/erp/relatorios/pacote-contabil/${kind}${query ? `?${query}` : ""}`;
}

function SimpleTable({ title, rows, limit = 8 }: { title: string; rows: Record<string, unknown>[]; limit?: number }) {
  const visible = rows.slice(0, limit);
  const headers = visible[0] ? Object.keys(visible[0]) : [];
  return (
    <section className="erp-card" style={{ marginTop: "1rem" }}>
      <div className="erp-card-head"><h3>{title}</h3></div>
      {visible.length === 0 ? (
        <div className="empty-st"><span>Sem dados no período.</span></div>
      ) : (
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
            <tbody>
              {visible.map((row, index) => (
                <tr key={index}>{headers.map((header) => <td key={header}>{String(row[header] ?? "")}</td>)}</tr>
              ))}
            </tbody>
          </table>
          {rows.length > limit && <p style={{ marginTop: "0.5rem", color: "var(--text-2)" }}>Mostrando {limit} de {rows.length}. Exporte CSV/HTML para ver tudo.</p>}
        </div>
      )}
    </section>
  );
}

function AbaContabil({ data, params }: { data: AccountingPackageReport; params: { mes?: number; ano?: number } }) {
  return (
    <div>
      <div className="alert warn" style={{ marginBottom: "1rem" }}>
        <strong>Pacote contábil mensal — {data.competencia || "competência atual"}.</strong>{" "}
        Base gerencial para conferência com a contabilidade. SPED/obrigações oficiais exigem validação do contador.
      </div>

      <form action="/erp/relatorios" style={{ display: "flex", gap: "0.75rem", alignItems: "end", marginBottom: "1rem" }}>
        <label>Mês<br /><input name="mes" type="number" min="1" max="12" defaultValue={params.mes ?? new Date().getMonth() + 1} /></label>
        <label>Ano<br /><input name="ano" type="number" min="2000" max="2100" defaultValue={params.ano ?? new Date().getFullYear()} /></label>
        <button className="btn" type="submit">Filtrar</button>
        <a className="btn light" href={exportHref("html", params)} target="_blank" rel="noreferrer">HTML / PDF</a>
        <a className="btn light" href={exportHref("csv", params)}>CSV</a>
        <a className="btn" href={exportHref("xml", params)}>Baixar XMLs (ZIP)</a>
      </form>

      <p style={{ margin: "-0.25rem 0 1rem", color: "var(--text-2)", fontSize: "0.85rem" }}>
        O ZIP traz os XMLs das notas de saída (NF-e, NFC-e e NFS-e) autorizadas/canceladas do mês,
        nomeados pela chave de acesso, mais um <strong>indice.csv</strong> — pronto para o contador.
      </p>

      <div className="kpi-row">
        <KpiCard label="Notas de saída" value={String(data.resumo.notasSaida)} tone="info" />
        <KpiCard label="Valor saídas" value={data.resumo.valorSaidas} tone="success" />
        <KpiCard label="Entradas fiscais" value={String(data.resumo.entradasFiscais)} tone="default" />
        <KpiCard label="Valor entradas" value={data.resumo.valorEntradas} tone="info" />
        <KpiCard label="Contas a receber" value={data.resumo.contasReceber} tone="success" />
        <KpiCard label="Contas a pagar" value={data.resumo.contasPagar} tone="warn" />
        <KpiCard label="Estoque a custo" value={data.resumo.valorEstoque} tone="default" />
        <KpiCard label="Pendências" value={String(data.resumo.pendencias)} tone={data.resumo.pendencias > 0 ? "warn" : "success"} />
      </div>

      <section className="erp-card" style={{ marginTop: "1.5rem" }}>
        <div className="erp-card-head"><h3>Checklist de fechamento</h3></div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead><tr><th>Status</th><th>Item</th><th>Detalhe</th></tr></thead>
            <tbody>{data.checklist.map((item) => <tr key={item.item}><td><StatusBadge tone={item.status === "ok" ? "success" : "warn"}>{item.status === "ok" ? "OK" : "Atenção"}</StatusBadge></td><td>{item.item}</td><td>{item.detalhe}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <SimpleTable title="Fiscal - Saídas" rows={data.fiscalSaidas} />
      <SimpleTable title="Fiscal - Entradas" rows={data.fiscalEntradas} />
      <SimpleTable title="Financeiro - Contas a receber" rows={data.financeiro.receber} />
      <SimpleTable title="Financeiro - Contas a pagar" rows={data.financeiro.pagar} />
      <SimpleTable title="Estoque - Movimentos" rows={data.estoque} />
    </div>
  );
}

// ─── Aba Apuração de impostos ───────────────────────────────────────────────────

function apuracaoHref(kind: "html" | "csv", params: { mes?: number; ano?: number }): string {
  const qs = new URLSearchParams();
  if (params.mes) qs.set("mes", String(params.mes));
  if (params.ano) qs.set("ano", String(params.ano));
  const query = qs.toString();
  return `/api/erp/relatorios/apuracao/${kind}${query ? `?${query}` : ""}`;
}

function AbaApuracao({ data, params }: { data: ApuracaoImpostosReport; params: { mes?: number; ano?: number } }) {
  const saldoLabel = data.totais.aPagar ? "Total a pagar" : "Saldo credor";
  return (
    <div>
      <div className="alert info" style={{ marginBottom: "1rem" }}>
        <strong>Apuração de impostos — {data.competencia || "competência atual"} · {data.regime}.</strong>{" "}
        Crédito das entradas processadas × débito das saídas autorizadas no período. Base gerencial;
        a apuração oficial (SPED/EFD) exige validação do contador.
      </div>

      {data.avisoRegime && (
        <div className="alert warn" style={{ marginBottom: "1rem" }}>{data.avisoRegime}</div>
      )}

      <form action="/erp/relatorios" style={{ display: "flex", gap: "0.75rem", alignItems: "end", marginBottom: "1rem" }}>
        <label>Mês<br /><input name="mes" type="number" min="1" max="12" defaultValue={params.mes ?? new Date().getMonth() + 1} /></label>
        <label>Ano<br /><input name="ano" type="number" min="2000" max="2100" defaultValue={params.ano ?? new Date().getFullYear()} /></label>
        <button className="btn" type="submit">Filtrar</button>
        <a className="btn light" href={apuracaoHref("html", params)} target="_blank" rel="noreferrer">HTML / PDF</a>
        <a className="btn light" href={apuracaoHref("csv", params)}>CSV</a>
      </form>

      <div className="kpi-row">
        <KpiCard label="Crédito (entradas)" value={data.totais.creditos} tone="success" />
        <KpiCard label="Débito (saídas)" value={data.totais.debitos} tone="warn" />
        <KpiCard label={saldoLabel} value={data.totais.saldo} tone={data.totais.aPagar ? "warn" : "success"} />
        <KpiCard label="Retido na fonte" value={data.totalRetido} tone="info" />
      </div>

      <section className="erp-card" style={{ marginTop: "1.5rem" }}>
        <div className="erp-card-head"><h3>Apuração por tributo</h3></div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead><tr><th>Tributo</th><th className="num">Débito</th><th className="num">Crédito</th><th className="num">Saldo</th><th>Situação</th></tr></thead>
            <tbody>
              {data.linhas.length === 0 ? (
                <tr><td colSpan={5} className="block-muted">Sem movimento no período.</td></tr>
              ) : (
                data.linhas.map((linha) => (
                  <tr key={linha.tributo}>
                    <td><strong>{linha.tributo}</strong></td>
                    <td className="num">{linha.debito}</td>
                    <td className="num">{linha.credito}</td>
                    <td className="num">{linha.saldo}</td>
                    <td>
                      <StatusBadge tone={linha.situacao === "A pagar" ? "warn" : linha.situacao === "Saldo credor" ? "success" : "mute"}>
                        {linha.situacao}
                      </StatusBadge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {data.retencoes.length > 0 && (
        <section className="erp-card" style={{ marginTop: "1.5rem" }}>
          <div className="erp-card-head"><h3>Retenções na fonte (saídas)</h3></div>
          <p className="block-muted" style={{ margin: "0 1rem" }}>
            Valores já retidos e recolhidos pelo tomador — a empresa não recolhe novamente. O ISS retido
            sai do débito; as retenções federais (IRRF, PIS, COFINS, CSLL, INSS) são antecipações compensáveis.
          </p>
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead><tr><th>Tributo retido</th><th className="num">Valor</th></tr></thead>
              <tbody>
                {data.retencoes.map((r) => (
                  <tr key={r.tributo}><td><strong>{r.tributo}</strong></td><td className="num">{r.valor}</td></tr>
                ))}
                <tr><td><strong>Total retido</strong></td><td className="num"><strong>{data.totalRetido}</strong></td></tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      <SimpleTable title="Créditos detalhados (entradas)" rows={data.entradasDetalhe} />
      <SimpleTable title="Débitos detalhados (saídas)" rows={data.saidasDetalhe} />
      <SimpleTable title="Retenções por nota" rows={data.retencoesDetalhe} />
    </div>
  );
}

// ─── Aba Livro de entradas (Acompanhamento de Entradas — modelo P1) ─────────────

const numBr = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function AbaLivroEntradas({ data, params }: { data: LivroEntradasReport; params: { mes?: number; ano?: number } }) {
  const csvHref = (() => {
    const qs = new URLSearchParams();
    if (params.mes) qs.set("mes", String(params.mes));
    if (params.ano) qs.set("ano", String(params.ano));
    const query = qs.toString();
    return `/api/erp/relatorios/livro-entradas/csv${query ? `?${query}` : ""}`;
  })();

  return (
    <div>
      <div className="alert info" style={{ marginBottom: "1rem" }}>
        <strong>Acompanhamento de entradas — {data.competencia} · {data.documentos} documento(s).</strong>{" "}
        Espelho do Livro Registro de Entradas (P1): notas do ERP + XMLs avulsos, agrupadas por CFOP de
        entrada, com os MESMOS créditos do SPED Fiscal (finalidade manual → regra De/Para → heurística).
      </div>

      <form action="/erp/relatorios" style={{ display: "flex", gap: "0.75rem", alignItems: "end", marginBottom: "1rem" }}>
        <label>Mês<br /><input name="mes" type="number" min="1" max="12" defaultValue={params.mes ?? new Date().getMonth() + 1} /></label>
        <label>Ano<br /><input name="ano" type="number" min="2000" max="2100" defaultValue={params.ano ?? new Date().getFullYear()} /></label>
        <button className="btn" type="submit">Filtrar</button>
        <a className="btn light" href={csvHref}>CSV</a>
        <button className="btn light" type="button" onClick={() => window.print()}>Imprimir / PDF</button>
      </form>

      <div className="kpi-row">
        <KpiCard label="Valor contábil" value={data.totais.valorContabilFmt} tone="info" />
        <KpiCard label="Base de cálculo" value={data.totais.baseCalculoFmt} tone="default" />
        <KpiCard label="ICMS creditado" value={data.totais.impostoFmt} tone="success" />
        <KpiCard
          label="ICMS Antecipação Parcial"
          value={data.totais.antecipacaoFmt}
          tone={data.totais.antecipacao > 0 ? "warn" : "default"}
        />
      </div>

      {data.grupos.length === 0 && (
        <div className="empty-st" style={{ marginTop: "1.5rem" }}><span>Sem entradas na competência.</span></div>
      )}

      {data.grupos.map((grupo) => (
        <section className="erp-card" style={{ marginTop: "1.5rem" }} key={grupo.cfop}>
          <div className="erp-card-head"><h3>CFOP {grupo.cfop}</h3></div>
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Nota</th>
                  <th>Fornecedor</th>
                  <th>UF</th>
                  <th>Origem</th>
                  <th className="num">Valor contábil</th>
                  <th className="num">Base cálculo</th>
                  <th className="num">Alíq.</th>
                  <th className="num">Imposto</th>
                  <th className="num">Isentas</th>
                  <th className="num">Outras</th>
                  <th className="num">Antecip.</th>
                </tr>
              </thead>
              <tbody>
                {grupo.linhas.map((l, i) => (
                  <tr key={`${l.numero}-${l.cfop}-${i}`}>
                    <td>{l.data}</td>
                    <td className="mono">{l.numero}/{l.serie}</td>
                    <td>{l.fornecedor}</td>
                    <td>{l.uf}</td>
                    <td><StatusBadge tone={l.origem === "XML" ? "info" : "mute"}>{l.origem}</StatusBadge></td>
                    <td className="num">{numBr(l.valorContabil)}</td>
                    <td className="num">{numBr(l.baseCalculo)}</td>
                    <td className="num">{l.aliquota != null ? `${numBr(l.aliquota)}%` : "—"}</td>
                    <td className="num">{numBr(l.imposto)}</td>
                    <td className="num">{numBr(l.isentas)}</td>
                    <td className="num">{numBr(l.outras)}</td>
                    <td className="num">{l.antecipacao > 0 ? numBr(l.antecipacao) : "—"}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={5}><strong>Total CFOP {grupo.cfop}</strong></td>
                  <td className="num"><strong>{numBr(grupo.totais.valorContabil)}</strong></td>
                  <td className="num"><strong>{numBr(grupo.totais.baseCalculo)}</strong></td>
                  <td className="num" />
                  <td className="num"><strong>{numBr(grupo.totais.imposto)}</strong></td>
                  <td className="num"><strong>{numBr(grupo.totais.isentas)}</strong></td>
                  <td className="num"><strong>{numBr(grupo.totais.outras)}</strong></td>
                  <td className="num"><strong>{grupo.totais.antecipacao > 0 ? numBr(grupo.totais.antecipacao) : "—"}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {data.grupos.length > 0 && (
        <section className="erp-card" style={{ marginTop: "1.5rem" }}>
          <div className="erp-card-head"><h3>Total geral — {data.competencia}</h3></div>
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead>
                <tr>
                  <th className="num">Valor contábil</th>
                  <th className="num">Base cálculo</th>
                  <th className="num">Imposto creditado</th>
                  <th className="num">Isentas</th>
                  <th className="num">Outras</th>
                  <th className="num">ICMS Antecipação</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="num"><strong>{numBr(data.totais.valorContabil)}</strong></td>
                  <td className="num"><strong>{numBr(data.totais.baseCalculo)}</strong></td>
                  <td className="num"><strong>{numBr(data.totais.imposto)}</strong></td>
                  <td className="num"><strong>{numBr(data.totais.isentas)}</strong></td>
                  <td className="num"><strong>{numBr(data.totais.outras)}</strong></td>
                  <td className="num"><strong>{numBr(data.totais.antecipacao)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data.avisos.length > 0 && (
        <div className="alert warn" style={{ marginTop: "1rem" }}>
          <strong>Avisos ({data.avisos.length})</strong>
          <ul style={{ margin: "0.25rem 0 0 1rem", fontSize: "0.85em" }}>
            {data.avisos.slice(0, 10).map((a, i) => <li key={i}>{a}</li>)}
            {data.avisos.length > 10 && <li>… e mais {data.avisos.length - 10} aviso(s) — veja na tela do SPED Fiscal.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ReportsView({ sales, stock, finance, fiscal, dre, accounting, apuracao, livroEntradas, accountingParams }: Props) {
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
      {activeTab === "contabil" && <AbaContabil data={accounting} params={accountingParams} />}
      {activeTab === "apuracao" && <AbaApuracao data={apuracao} params={accountingParams} />}
      {activeTab === "entradas" && <AbaLivroEntradas data={livroEntradas} params={accountingParams} />}
    </div>
  );
}

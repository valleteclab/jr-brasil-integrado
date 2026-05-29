"use client";

import { useState } from "react";
import { KpiCard } from "@/components/shared/KpiCard";
import type { CashFlowData, CashFlowDay } from "@/lib/services/finance";

type Props = {
  data: CashFlowData;
};

function formatBrl(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function SaldoCell({ value }: { value: number }) {
  const cls = value > 0 ? "num positive" : value < 0 ? "num negative" : "num";
  return <td className={cls}>{formatBrl(value)}</td>;
}

export function CashFlowView({ data }: Props) {
  const [periodo, setPeriodo] = useState<30 | 60 | 90>(30);

  const periodoAtivo =
    periodo === 30 ? data.projetado30 : periodo === 60 ? data.projetado60 : data.projetado90;

  // Filtra dias pelo período selecionado
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const limiteMs = hoje.getTime() + periodo * 24 * 60 * 60 * 1000;

  const diasFiltrados: CashFlowDay[] = data.dias.filter((d) => {
    // A data está em pt-BR (dd/mm/aaaa), converte para Date
    const parts = d.data.split("/");
    if (parts.length !== 3) return true;
    const dt = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00`);
    return dt.getTime() <= limiteMs;
  });

  return (
    <>
      {/* KPIs de período */}
      <div className="kpi-row">
        <KpiCard
          label="Saldo Atual em Contas"
          value={formatBrl(data.saldoAtualContas)}
          tone={data.saldoAtualContas >= 0 ? "info" : "danger"}
        />
        <KpiCard
          label={`Entradas Projetadas (${periodo}d)`}
          value={formatBrl(periodoAtivo.totalEntradas)}
          tone="success"
        />
        <KpiCard
          label={`Saídas Projetadas (${periodo}d)`}
          value={formatBrl(periodoAtivo.totalSaidas)}
          tone="warn"
        />
        <KpiCard
          label={`Saldo Projetado (${periodo}d)`}
          value={formatBrl(periodoAtivo.saldo)}
          tone={periodoAtivo.saldo >= 0 ? "success" : "danger"}
        />
      </div>

      {/* Realizado */}
      <div className="erp-card">
        <div className="erp-card-head"><h3>Realizado — últimos 30 dias</h3></div>
        <div className="kpi-row">
          <KpiCard
            label="Créditos Realizados"
            value={formatBrl(data.realizado30.totalCreditos)}
            tone="success"
          />
          <KpiCard
            label="Débitos Realizados"
            value={formatBrl(data.realizado30.totalDebitos)}
            tone="warn"
          />
          <KpiCard
            label="Saldo Realizado"
            value={formatBrl(data.realizado30.saldo)}
            tone={data.realizado30.saldo >= 0 ? "info" : "danger"}
          />
        </div>
      </div>

      {/* Filtro de período */}
      <div className="erp-toolbar">
        <span>Projeção por período:</span>
        <div className="stat-pills">
          {([30, 60, 90] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={periodo === p ? "active" : ""}
              onClick={() => setPeriodo(p)}
            >
              {p} dias
            </button>
          ))}
        </div>
        <div className="toolbar-grow" />
        <span className="muted">
          {diasFiltrados.length} dias com movimentação projetada
        </span>
      </div>

      {/* Tabela de projeção */}
      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Data</th>
              <th className="num">Entradas</th>
              <th className="num">Saídas</th>
              <th className="num">Saldo do Dia</th>
              <th className="num">Saldo Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {diasFiltrados.map((d, i) => (
              <tr key={i}>
                <td>{d.data}</td>
                <td className="num positive">{d.entradas > 0 ? formatBrl(d.entradas) : "—"}</td>
                <td className="num negative">{d.saidas > 0 ? formatBrl(d.saidas) : "—"}</td>
                <SaldoCell value={d.saldoDia} />
                <SaldoCell value={d.saldoAcumulado} />
              </tr>
            ))}
            {!diasFiltrados.length && (
              <tr>
                <td colSpan={5}>
                  <div className="empty-st">
                    Nenhuma movimentação projetada para os próximos {periodo} dias.
                    Cadastre contas a pagar e a receber para visualizar o fluxo.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Resumo dos períodos */}
      <div className="erp-card">
        <div className="erp-card-head"><h3>Resumo por Horizonte</h3></div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Horizonte</th>
                <th className="num">Entradas</th>
                <th className="num">Saídas</th>
                <th className="num">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {[data.projetado30, data.projetado60, data.projetado90].map((p) => (
                <tr key={p.label}>
                  <td>{p.label}</td>
                  <td className="num positive">{formatBrl(p.totalEntradas)}</td>
                  <td className="num negative">{formatBrl(p.totalSaidas)}</td>
                  <SaldoCell value={p.saldo} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

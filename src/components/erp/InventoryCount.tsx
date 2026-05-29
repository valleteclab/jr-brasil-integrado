"use client";

import { useState } from "react";
import { Button } from "@/components/shared/Button";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { InventoryDetail, InventoryItemDetail } from "@/lib/services/stock";

type Props = {
  inventory: InventoryDetail;
};

export function InventoryCount({ inventory: initial }: Props) {
  const [inventory, setInventory] = useState(initial);
  const [counts, setCounts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const it of initial.itens) {
      if (it.saldoContado !== null) {
        init[it.id] = String(it.saldoContado);
      }
    }
    return init;
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  const isFinalizado = inventory.statusLabel === "Finalizado";
  const isCancelado = inventory.statusLabel === "Cancelado";
  const isReadOnly = isFinalizado || isCancelado;

  async function saveCount(item: InventoryItemDetail) {
    const val = counts[item.id];
    if (val === undefined || val === "") return;
    const num = Number(val);
    if (isNaN(num) || num < 0) {
      setError("Quantidade contada inválida.");
      return;
    }

    setSaving(item.id);
    setError("");
    try {
      const res = await fetch(`/api/erp/inventarios/${inventory.id}/contagem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, saldoContado: num })
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao salvar.");

      setInventory((prev) => ({
        ...prev,
        itens: prev.itens.map((it) =>
          it.id === item.id
            ? { ...it, saldoContado: num, diferenca: num - it.saldoSistema, contado: true }
            : it
        )
      }));
      setFlash(`Contagem do item "${item.produtoNome}" salva.`);
      setTimeout(() => setFlash(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar contagem.");
    } finally {
      setSaving(null);
    }
  }

  async function finalize() {
    if (!confirm("Finalizar inventário? Isso aplicará ajustes de estoque para todos os itens com divergência.")) return;

    setFinalizing(true);
    setError("");
    try {
      const res = await fetch(`/api/erp/inventarios/${inventory.id}/finalizar`, {
        method: "POST"
      });
      const data = (await res.json()) as { ajustesRealizados?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao finalizar.");

      setInventory((prev) => ({
        ...prev,
        statusLabel: "Finalizado",
        statusTone: "success",
        finalizadoEm: new Date().toLocaleDateString("pt-BR")
      }));
      setFlash(`Inventário finalizado! ${data.ajustesRealizados ?? 0} ajuste(s) de estoque realizados.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao finalizar inventário.");
    } finally {
      setFinalizing(false);
    }
  }

  const contados = inventory.itens.filter((it) => it.contado).length;
  const divergencias = inventory.itens.filter(
    (it) => it.contado && it.diferenca !== null && it.diferenca !== 0
  ).length;

  return (
    <div>
      <div className="kpi-row">
        <KpiCard label="Total de itens" value={String(inventory.itens.length)} />
        <KpiCard label="Contados" value={String(contados)} tone="info" />
        <KpiCard label="Divergências" value={String(divergencias)} tone={divergencias > 0 ? "warn" : "default"} />
      </div>

      {error && <div className="alert danger"><strong>Erro</strong><span>{error}</span></div>}
      {flash && <div className="alert success"><strong>OK</strong><span>{flash}</span></div>}

      {!isReadOnly && (
        <div className="erp-toolbar">
          <div className="toolbar-grow" />
          <Button
            variant="primary"
            onClick={finalize}
            disabled={finalizing || contados === 0}
          >
            {finalizing ? "Finalizando..." : "Finalizar inventário"}
          </Button>
        </div>
      )}

      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th className="num">Saldo sistema</th>
              <th className="num">Saldo contado</th>
              <th className="num">Diferença</th>
              <th className="num">Custo unit.</th>
              <th>Situação</th>
              {!isReadOnly && <th className="actions">Ação</th>}
            </tr>
          </thead>
          <tbody>
            {inventory.itens.map((item) => {
              const currVal = counts[item.id] ?? "";
              const counted = item.contado;
              const diff = item.diferenca;
              const diffTone = diff === null ? "mute" : diff === 0 ? "success" : diff > 0 ? "warn" : "danger";

              return (
                <tr key={item.id}>
                  <td>
                    <span className="mono bold">{item.produtoSku}</span>
                    <small className="block-muted">{item.produtoNome}</small>
                  </td>
                  <td className="num">{item.saldoSistema.toFixed(3)}</td>
                  <td className="num">
                    {isReadOnly ? (
                      item.saldoContado !== null ? item.saldoContado.toFixed(3) : "—"
                    ) : (
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={currVal}
                        onChange={(e) => setCounts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        style={{ width: "90px", textAlign: "right" }}
                        placeholder={item.saldoSistema.toFixed(3)}
                      />
                    )}
                  </td>
                  <td className="num">
                    {diff !== null ? (
                      <StatusBadge tone={diffTone}>
                        {diff > 0 ? `+${diff.toFixed(3)}` : diff.toFixed(3)}
                      </StatusBadge>
                    ) : "—"}
                  </td>
                  <td className="num">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.custoUnitario)}
                  </td>
                  <td>
                    {item.ajustado ? (
                      <StatusBadge tone="success">Ajustado</StatusBadge>
                    ) : counted ? (
                      <StatusBadge tone="info">Contado</StatusBadge>
                    ) : (
                      <StatusBadge tone="mute">Pendente</StatusBadge>
                    )}
                  </td>
                  {!isReadOnly && (
                    <td className="actions">
                      <Button
                        variant="light"
                        type="button"
                        disabled={saving === item.id || !currVal}
                        onClick={() => saveCount(item)}
                      >
                        {saving === item.id ? "Salvando..." : "Salvar"}
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
            {inventory.itens.length === 0 && (
              <tr>
                <td colSpan={isReadOnly ? 6 : 7}>
                  <div className="empty-st">Nenhum item neste inventário.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/shared/Button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { PurchaseOrderSummary } from "@/lib/services/purchasing";

type ReceiveItem = {
  itemId: string;
  produtoNome: string;
  produtoSku: string;
  quantidade: number;
  quantidadeRecebida: number;
  quantidadeAReceber: number;
};

type ReceiveForm = {
  pedidoId: string;
  numero: string;
  itens: ReceiveItem[];
  gerarContaPagar: boolean;
  vencimento: string;
};

type Props = {
  initialOrders: PurchaseOrderSummary[];
};

function defaultVencimento() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

export function PurchaseList({ initialOrders }: Props) {
  const [orders, setOrders] = useState(initialOrders);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [receiveForm, setReceiveForm] = useState<ReceiveForm | null>(null);

  const statusCounts = useMemo(() => ({
    todos: orders.length,
    abertos: orders.filter((o) => o.status === "RASCUNHO" || o.status === "ENVIADO").length,
    aReceber: orders.filter((o) => o.status === "ENVIADO" || o.status === "PARCIAL").length
  }), [orders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      const matchQuery = !q || [o.numero, o.fornecedor, o.status].some((f) => f.toLowerCase().includes(q));
      const matchStatus = statusFilter === "todos"
        || (statusFilter === "abertos" && (o.status === "RASCUNHO" || o.status === "ENVIADO"))
        || (statusFilter === "aReceber" && (o.status === "ENVIADO" || o.status === "PARCIAL"))
        || o.status === statusFilter;
      return matchQuery && matchStatus;
    });
  }, [orders, query, statusFilter]);

  async function enviar(o: PurchaseOrderSummary) {
    if (!window.confirm(`Enviar o pedido ${o.numero} para o fornecedor?`)) return;
    setBusyId(o.id);
    setError("");
    try {
      const res = await fetch(`/api/erp/compras/${o.id}/enviar`, { method: "POST" });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível enviar.");
      setOrders((cur) =>
        cur.map((x) =>
          x.id === o.id
            ? { ...x, status: "ENVIADO", statusLabel: "Enviado", statusTone: "info", canEnviar: false, canReceber: true }
            : x
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao enviar.");
    } finally {
      setBusyId(null);
    }
  }

  async function cancelar(o: PurchaseOrderSummary) {
    if (!window.confirm(`Cancelar o pedido ${o.numero}? Esta ação não pode ser desfeita.`)) return;
    setBusyId(o.id);
    setError("");
    try {
      const res = await fetch(`/api/erp/compras/${o.id}/cancelar`, { method: "POST" });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível cancelar.");
      setOrders((cur) =>
        cur.map((x) =>
          x.id === o.id
            ? {
                ...x,
                status: "CANCELADO",
                statusLabel: "Cancelado",
                statusTone: "danger",
                canEnviar: false,
                canReceber: false,
                canCancelar: false
              }
            : x
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao cancelar.");
    } finally {
      setBusyId(null);
    }
  }

  async function openReceive(o: PurchaseOrderSummary) {
    setBusyId(o.id);
    setError("");
    try {
      const res = await fetch(`/api/erp/compras/${o.id}/detail`);
      // Fallback: use summary data if detail endpoint doesn't exist
      if (!res.ok) {
        // Build minimal receive form from summary
        setReceiveForm({
          pedidoId: o.id,
          numero: o.numero,
          itens: [],
          gerarContaPagar: false,
          vencimento: defaultVencimento()
        });
        return;
      }
      const detail = await res.json() as {
        itens?: Array<{
          id: string;
          produtoNome: string;
          produtoSku: string;
          quantidade: number;
          quantidadeRecebida: number;
        }>;
        error?: string;
      };
      setReceiveForm({
        pedidoId: o.id,
        numero: o.numero,
        itens: (detail.itens ?? []).map((item) => ({
          itemId: item.id,
          produtoNome: item.produtoNome,
          produtoSku: item.produtoSku,
          quantidade: item.quantidade,
          quantidadeRecebida: item.quantidadeRecebida,
          quantidadeAReceber: Math.max(0, item.quantidade - item.quantidadeRecebida)
        })),
        gerarContaPagar: false,
        vencimento: defaultVencimento()
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar pedido.");
    } finally {
      setBusyId(null);
    }
  }

  async function submitReceive() {
    if (!receiveForm) return;
    const payload = {
      itens: receiveForm.itens.map((i) => ({
        itemId: i.itemId,
        quantidadeRecebida: i.quantidadeAReceber
      })).filter((i) => i.quantidadeRecebida > 0),
      gerarContaPagar: receiveForm.gerarContaPagar,
      vencimento: receiveForm.vencimento
    };

    if (!payload.itens.length) {
      setError("Informe a quantidade recebida de ao menos um item.");
      return;
    }

    setBusyId(receiveForm.pedidoId);
    setError("");
    try {
      const res = await fetch(`/api/erp/compras/${receiveForm.pedidoId}/receber`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json() as { status?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível registrar o recebimento.");

      const newStatus = data.status ?? "PARCIAL";
      const statusLabel: Record<string, string> = {
        RECEBIDO: "Recebido",
        PARCIAL: "Parcialmente recebido"
      };
      const statusTone: Record<string, "success" | "warn"> = {
        RECEBIDO: "success",
        PARCIAL: "warn"
      };

      setOrders((cur) =>
        cur.map((x) =>
          x.id === receiveForm.pedidoId
            ? {
                ...x,
                status: newStatus,
                statusLabel: statusLabel[newStatus] ?? newStatus,
                statusTone: statusTone[newStatus] ?? "mute",
                canEnviar: false,
                canReceber: newStatus === "PARCIAL",
                canCancelar: false
              }
            : x
        )
      );
      setReceiveForm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao registrar recebimento.");
    } finally {
      setBusyId(null);
    }
  }

  function updateQtdAReceber(itemId: string, value: number) {
    setReceiveForm((f) =>
      f
        ? {
            ...f,
            itens: f.itens.map((i) =>
              i.itemId === itemId ? { ...i, quantidadeAReceber: Math.max(0, value) } : i
            )
          }
        : f
    );
  }

  return (
    <>
      <div className="erp-page-actions">
        <Button href="/erp/compras/nova">+ Novo pedido de compra</Button>
      </div>

      {error && (
        <div className="alert danger"><strong>Atenção</strong><span>{error}</span></div>
      )}

      <section className="erp-card">
        <div className="erp-toolbar">
          <div className="toolbar-search">
            <span aria-hidden="true">⌕</span>
            <input
              className="search"
              placeholder="Buscar por número, fornecedor, status..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="stat-pills">
            <button
              className={statusFilter === "todos" ? "active" : ""}
              type="button"
              onClick={() => setStatusFilter("todos")}
            >
              Todos <span>{statusCounts.todos}</span>
            </button>
            <button
              className={statusFilter === "abertos" ? "active" : ""}
              type="button"
              onClick={() => setStatusFilter("abertos")}
            >
              Em aberto <span>{statusCounts.abertos}</span>
            </button>
            <button
              className={statusFilter === "aReceber" ? "active" : ""}
              type="button"
              onClick={() => setStatusFilter("aReceber")}
            >
              A receber <span>{statusCounts.aReceber}</span>
            </button>
          </div>
        </div>

        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Fornecedor</th>
                <th>Situação</th>
                <th className="num">Recebido</th>
                <th className="num">Total</th>
                <th>Previsão</th>
                <th className="actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id}>
                  <td>
                    <span className="mono bold">{o.numero}</span>
                    <small className="block-muted">{o.criadoEm}</small>
                  </td>
                  <td>
                    <strong>{o.fornecedor}</strong>
                    {o.condicaoPagamento && (
                      <small className="block-muted">{o.condicaoPagamento}</small>
                    )}
                  </td>
                  <td>
                    <StatusBadge tone={o.statusTone}>{o.statusLabel}</StatusBadge>
                  </td>
                  <td className="num">
                    <span className={o.percentRecebido === 100 ? "text-success" : o.percentRecebido > 0 ? "text-warn" : ""}>
                      {o.percentRecebido}%
                    </span>
                  </td>
                  <td className="num">{o.total}</td>
                  <td>{o.previsaoEm ?? <span className="muted">—</span>}</td>
                  <td className="actions">
                    {o.canEnviar && (
                      <Button
                        variant="light"
                        type="button"
                        disabled={busyId === o.id}
                        onClick={() => enviar(o)}
                      >
                        Enviar
                      </Button>
                    )}
                    {o.canReceber && (
                      <Button
                        variant="light"
                        type="button"
                        disabled={busyId === o.id}
                        onClick={() => openReceive(o)}
                      >
                        Receber
                      </Button>
                    )}
                    {o.canCancelar && (
                      <button
                        className="danger-link"
                        type="button"
                        disabled={busyId === o.id}
                        onClick={() => cancelar(o)}
                      >
                        Cancelar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-st">
                      Nenhum pedido de compra encontrado. Clique em &quot;+ Novo pedido de compra&quot; para criar.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {receiveForm && (
        <>
          <div className="drawer-bd" onClick={() => setReceiveForm(null)} />
          <aside className="drawer" aria-label="Registrar recebimento">
            <header className="drawer-head">
              <div>
                <h2>Recebimento — {receiveForm.numero}</h2>
                <p>Informe as quantidades recebidas nesta entrega</p>
              </div>
              <button type="button" onClick={() => setReceiveForm(null)}>Fechar</button>
            </header>
            <div className="drawer-body">
              {receiveForm.itens.length === 0 ? (
                <div className="alert warn">
                  <strong>Atenção</strong>
                  <span>Não foi possível carregar os itens. Tente novamente.</span>
                </div>
              ) : (
                <div className="erp-table-wrap">
                  <table className="erp-table">
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th className="num">Pedido</th>
                        <th className="num">Já rec.</th>
                        <th className="num">Receber agora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receiveForm.itens.map((item) => (
                        <tr key={item.itemId}>
                          <td>
                            <strong>{item.produtoNome}</strong>
                            <small className="block-muted">{item.produtoSku}</small>
                          </td>
                          <td className="num">{item.quantidade}</td>
                          <td className="num">{item.quantidadeRecebida}</td>
                          <td className="num">
                            <input
                              type="number"
                              min={0}
                              max={item.quantidade - item.quantidadeRecebida}
                              step={1}
                              value={item.quantidadeAReceber}
                              onChange={(e) =>
                                updateQtdAReceber(item.itemId, Math.floor(Number(e.target.value)))
                              }
                              style={{ width: "80px", textAlign: "right" }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="erp-form" style={{ marginTop: "1rem" }}>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={receiveForm.gerarContaPagar}
                    onChange={(e) =>
                      setReceiveForm((f) => f ? { ...f, gerarContaPagar: e.target.checked } : f)
                    }
                  />
                  Gerar conta a pagar automaticamente
                </label>
                {receiveForm.gerarContaPagar && (
                  <label>
                    Vencimento
                    <input
                      type="date"
                      value={receiveForm.vencimento}
                      onChange={(e) =>
                        setReceiveForm((f) => f ? { ...f, vencimento: e.target.value } : f)
                      }
                    />
                  </label>
                )}
              </div>

              {error && <p className="form-error drawer-error">{error}</p>}
            </div>
            <footer className="drawer-foot">
              <Button variant="light" type="button" onClick={() => setReceiveForm(null)}>Cancelar</Button>
              <Button
                type="button"
                disabled={busyId === receiveForm.pedidoId}
                onClick={submitReceive}
              >
                {busyId === receiveForm.pedidoId ? "Registrando..." : "Confirmar recebimento"}
              </Button>
            </footer>
          </aside>
        </>
      )}
    </>
  );
}

"use client";

import { useMemo, useState } from "react";
import type { StockBalance, StockMovement, InventorySummary, DepositoOption, ProdutoOption } from "@/lib/services/stock";
import { correspondeBusca } from "@/lib/search/normalize";

type PillTone = "success" | "warn" | "danger" | "info" | "violet" | "mute";

function Pill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return (
    <span className={`pill ${tone}`}>
      <span className="dot" />
      {children}
    </span>
  );
}

const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

type Tab = "saldos" | "movimentos" | "inventarios";

type Props = {
  balances: StockBalance[];
  movements: StockMovement[];
  inventories: InventorySummary[];
  depositos: DepositoOption[];
  produtos: ProdutoOption[];
};

// ──────────────────────────────────────────────
// Adjust form
// ──────────────────────────────────────────────

function AdjustForm({
  produtos,
  depositos,
  onClose,
  onSuccess
}: {
  produtos: ProdutoOption[];
  depositos: DepositoOption[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [produtoId, setProdutoId] = useState("");
  const [depositoId, setDepositoId] = useState(depositos.find((d) => d.padrao)?.id ?? depositos[0]?.id ?? "");
  const [novaQtd, setNovaQtd] = useState("");
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!produtoId || novaQtd === "" || !motivo.trim()) {
      setError("Preencha todos os campos.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/erp/estoque/ajuste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtoId, depositoId: depositoId || undefined, novaQuantidade: Number(novaQtd), motivo })
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao ajustar.");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao ajustar estoque.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="erp-card" onSubmit={submit}>
      <div className="erp-card-head"><h3>Ajuste de estoque</h3></div>
      {error && <div className="alert danger"><strong>Erro</strong><span>{error}</span></div>}
      <div className="erp-form">
        <label>
          Produto
          <select value={produtoId} onChange={(e) => setProdutoId(e.target.value)} required>
            <option value="">Selecione...</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>[{p.sku}] {p.nome} — {p.disponivel} disponível</option>
            ))}
          </select>
        </label>
        <label>
          Depósito
          <select value={depositoId} onChange={(e) => setDepositoId(e.target.value)}>
            {depositos.map((d) => (
              <option key={d.id} value={d.id}>{d.nome}{d.padrao ? " (padrão)" : ""}</option>
            ))}
          </select>
        </label>
        <label>
          Nova quantidade
          <input type="number" min="0" step="0.001" value={novaQtd} onChange={(e) => setNovaQtd(e.target.value)} required placeholder="0" />
        </label>
        <label>
          Motivo
          <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} required placeholder="Motivo do ajuste" />
        </label>
      </div>
      <div className="inline-foot">
        <button type="button" className="btn-erp ghost sm" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn-erp primary sm" disabled={loading}>{loading ? "Salvando..." : "Confirmar ajuste"}</button>
      </div>
    </form>
  );
}

// ──────────────────────────────────────────────
// Transfer form
// ──────────────────────────────────────────────

function TransferForm({
  produtos,
  depositos,
  onClose,
  onSuccess
}: {
  produtos: ProdutoOption[];
  depositos: DepositoOption[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const padraoId = depositos.find((d) => d.padrao)?.id ?? depositos[0]?.id ?? "";
  const [produtoId, setProdutoId] = useState("");
  const [origemId, setOrigemId] = useState(padraoId);
  const [destinoId, setDestinoId] = useState(depositos.find((d) => !d.padrao)?.id ?? "");
  const [qtd, setQtd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!produtoId || !origemId || !destinoId || !qtd) {
      setError("Preencha todos os campos.");
      return;
    }
    if (origemId === destinoId) {
      setError("Origem e destino não podem ser iguais.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/erp/estoque/transferencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtoId, depositoOrigemId: origemId, depositoDestinoId: destinoId, quantidade: Number(qtd) })
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro na transferência.");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao transferir estoque.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="erp-card" onSubmit={submit}>
      <div className="erp-card-head"><h3>Transferência entre depósitos</h3></div>
      {error && <div className="alert danger"><strong>Erro</strong><span>{error}</span></div>}
      <div className="erp-form">
        <label>
          Produto
          <select value={produtoId} onChange={(e) => setProdutoId(e.target.value)} required>
            <option value="">Selecione...</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>[{p.sku}] {p.nome} — {p.disponivel} disponível</option>
            ))}
          </select>
        </label>
        <label>
          Quantidade
          <input type="number" min="0.001" step="0.001" value={qtd} onChange={(e) => setQtd(e.target.value)} required placeholder="0" />
        </label>
        <label>
          Depósito de origem
          <select value={origemId} onChange={(e) => setOrigemId(e.target.value)} required>
            <option value="">Selecione...</option>
            {depositos.map((d) => (
              <option key={d.id} value={d.id}>{d.nome}</option>
            ))}
          </select>
        </label>
        <label>
          Depósito de destino
          <select value={destinoId} onChange={(e) => setDestinoId(e.target.value)} required>
            <option value="">Selecione...</option>
            {depositos.map((d) => (
              <option key={d.id} value={d.id}>{d.nome}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="inline-foot">
        <button type="button" className="btn-erp ghost sm" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn-erp primary sm" disabled={loading}>{loading ? "Transferindo..." : "Confirmar transferência"}</button>
      </div>
    </form>
  );
}

// ──────────────────────────────────────────────
// New Inventory form
// ──────────────────────────────────────────────

function NewInventoryForm({
  depositos,
  onClose,
  onSuccess
}: {
  depositos: DepositoOption[];
  onClose: () => void;
  onSuccess: (id: string, numero: string) => void;
}) {
  const [depositoId, setDepositoId] = useState(depositos.find((d) => d.padrao)?.id ?? depositos[0]?.id ?? "");
  const [descricao, setDescricao] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!depositoId) { setError("Selecione um depósito."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/erp/inventarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositoId, descricao: descricao || undefined })
      });
      const data = (await res.json()) as { id?: string; numero?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar inventário.");
      onSuccess(data.id!, data.numero!);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar inventário.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="erp-card" onSubmit={submit}>
      <div className="erp-card-head"><h3>Novo inventário</h3></div>
      {error && <div className="alert danger"><strong>Erro</strong><span>{error}</span></div>}
      <div className="erp-form">
        <label>
          Depósito
          <select value={depositoId} onChange={(e) => setDepositoId(e.target.value)} required>
            {depositos.map((d) => (
              <option key={d.id} value={d.id}>{d.nome}{d.padrao ? " (padrão)" : ""}</option>
            ))}
          </select>
        </label>
        <label>
          Descrição (opcional)
          <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Inventário mensal" />
        </label>
      </div>
      <div className="inline-foot">
        <button type="button" className="btn-erp ghost sm" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn-erp primary sm" disabled={loading}>{loading ? "Criando..." : "Criar inventário"}</button>
      </div>
    </form>
  );
}

// ──────────────────────────────────────────────
// Balances tab
// ──────────────────────────────────────────────

function BalancesTab({
  balances,
  depositos,
  produtos
}: {
  balances: StockBalance[];
  depositos: DepositoOption[];
  produtos: ProdutoOption[];
}) {
  const [modal, setModal] = useState<"ajuste" | "transferencia" | null>(null);
  const [query, setQuery] = useState("");
  const [flash, setFlash] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return balances;
    return balances.filter((b) => correspondeBusca(query, b.sku, b.nome, b.depositoNome, b.gtin, b.codigoOriginal, b.codigoFabricante));
  }, [balances, query]);

  function handleSuccess(msg: string) {
    setModal(null);
    setFlash(msg);
    setTimeout(() => window.location.reload(), 1500);
  }

  return (
    <section>
      <div className="erp-toolbar product-toolbar">
        <div className="toolbar-search">
          <span className="ic-sr" aria-hidden="true">⌕</span>
          <input
            className="search"
            placeholder="Buscar por SKU, produto ou depósito..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="toolbar-grow" />
        <button type="button" className="btn-erp ghost sm" onClick={() => setModal("ajuste")}>Ajustar estoque</button>
        <button type="button" className="btn-erp ghost sm" onClick={() => setModal("transferencia")}>Transferir</button>
      </div>

      {flash && <div className="alert success"><strong>Sucesso</strong><span>{flash}</span></div>}

      {modal === "ajuste" && (
        <AdjustForm
          produtos={produtos}
          depositos={depositos}
          onClose={() => setModal(null)}
          onSuccess={() => handleSuccess("Ajuste realizado com sucesso. Atualizando...")}
        />
      )}
      {modal === "transferencia" && (
        <TransferForm
          produtos={produtos}
          depositos={depositos}
          onClose={() => setModal(null)}
          onSuccess={() => handleSuccess("Transferência realizada com sucesso. Atualizando...")}
        />
      )}

      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Depósito</th>
              <th className="num">Qtd.</th>
              <th className="num">Reservado</th>
              <th className="num">Disponível</th>
              <th className="num">Custo médio</th>
              <th className="num">Valor a custo</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => (
              <tr key={`${b.produtoId}:${b.depositoId}`}>
                <td>
                  <span className="mono bold">{b.sku}</span>
                  <small className="block-muted">{b.nome}</small>
                </td>
                <td>{b.depositoNome}</td>
                <td className="num">{b.quantidade.toFixed(2)}</td>
                <td className="num">{b.reservado.toFixed(2)}</td>
                <td className="num">{b.disponivel.toFixed(2)}</td>
                <td className="num">{brl(b.custoMedio)}</td>
                <td className="num">{b.valorTotalCusto}</td>
                <td>
                  <Pill tone={b.statusTone}>{b.status}</Pill>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-st">
                    <h4>Nenhum saldo encontrado</h4>
                    <p>Ajuste a busca para localizar saldos de estoque.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────
// Movements tab
// ──────────────────────────────────────────────

function MovementsTab({ movements }: { movements: StockMovement[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return movements;
    return movements.filter((m) =>
      m.produtoSku.toLowerCase().includes(q) ||
      m.produtoNome.toLowerCase().includes(q) ||
      m.tipoLabel.toLowerCase().includes(q) ||
      (m.documentoTipo ?? "").toLowerCase().includes(q)
    );
  }, [movements, query]);

  function tipoTone(tipo: string): "success" | "danger" | "info" | "warn" | "mute" {
    if (tipo === "ENTRADA") return "success";
    if (tipo === "SAIDA") return "danger";
    if (tipo === "TRANSFERENCIA") return "info";
    if (tipo === "AJUSTE") return "warn";
    return "mute";
  }

  return (
    <section>
      <div className="erp-toolbar product-toolbar">
        <div className="toolbar-search">
          <span className="ic-sr" aria-hidden="true">⌕</span>
          <input
            className="search"
            placeholder="Buscar por SKU, produto ou tipo..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="toolbar-grow" />
      </div>
      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Depósito</th>
              <th>Tipo</th>
              <th className="num">Quantidade</th>
              <th className="num">Saldo após</th>
              <th>Documento</th>
              <th>Data</th>
              <th>Observações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id}>
                <td>
                  <span className="mono bold">{m.produtoSku}</span>
                  <small className="block-muted">{m.produtoNome}</small>
                </td>
                <td>{m.depositoNome}</td>
                <td><Pill tone={tipoTone(m.tipo)}>{m.tipoLabel}</Pill></td>
                <td className="num">{m.quantidade > 0 ? `+${m.quantidade.toFixed(3)}` : m.quantidade.toFixed(3)}</td>
                <td className="num">{m.saldoDepois.toFixed(3)}</td>
                <td><span className="mono">{m.documentoTipo ?? "—"}</span></td>
                <td><small>{m.data}</small></td>
                <td><small className="block-muted">{m.observacoes ?? "—"}</small></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-st">
                    <h4>Nenhuma movimentação</h4>
                    <p>Nenhuma movimentação de estoque foi registrada.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────
// Inventories tab
// ──────────────────────────────────────────────

function InventoriesTab({
  inventories,
  depositos
}: {
  inventories: InventorySummary[];
  depositos: DepositoOption[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [flash, setFlash] = useState("");

  function handleCreated(id: string, numero: string) {
    setShowForm(false);
    setFlash(`Inventário ${numero} criado com sucesso.`);
    setTimeout(() => {
      window.location.href = `/erp/inventarios/${id}`;
    }, 800);
  }

  return (
    <section>
      <div className="erp-toolbar product-toolbar">
        <div className="toolbar-grow" />
        <button type="button" className="btn-erp primary sm" onClick={() => setShowForm(true)}>Novo inventário</button>
      </div>

      {flash && <div className="alert success"><strong>Sucesso</strong><span>{flash}</span></div>}

      {showForm && (
        <NewInventoryForm
          depositos={depositos}
          onClose={() => setShowForm(false)}
          onSuccess={handleCreated}
        />
      )}

      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Depósito</th>
              <th>Descrição</th>
              <th className="num">Itens</th>
              <th className="num">Divergências</th>
              <th>Situação</th>
              <th>Iniciado em</th>
              <th>Finalizado em</th>
              <th className="actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            {inventories.map((inv) => (
              <tr key={inv.id}>
                <td><span className="mono bold">{inv.numero}</span></td>
                <td>{inv.depositoNome}</td>
                <td>{inv.descricao ?? "—"}</td>
                <td className="num">{inv.totalItens}</td>
                <td className="num">
                  {inv.divergencias > 0
                    ? <Pill tone="warn">{inv.divergencias}</Pill>
                    : "0"
                  }
                </td>
                <td><Pill tone={inv.statusTone}>{inv.statusLabel}</Pill></td>
                <td><small>{inv.iniciadoEm ?? "—"}</small></td>
                <td><small>{inv.finalizadoEm ?? "—"}</small></td>
                <td className="actions">
                  <a className="btn-erp ghost xs" href={`/erp/inventarios/${inv.id}`}>
                    {inv.status === "FINALIZADO" ? "Ver" : "Contar"}
                  </a>
                </td>
              </tr>
            ))}
            {inventories.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <div className="empty-st">
                    <h4>Nenhum inventário criado</h4>
                    <p>Clique em &quot;Novo inventário&quot; para iniciar uma contagem.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────
// Main StockManager
// ──────────────────────────────────────────────

export function StockManager({ balances, movements, inventories, depositos, produtos }: Props) {
  const [tab, setTab] = useState<Tab>("saldos");

  return (
    <div>
      <nav className="tabs" role="tablist" aria-label="Módulos de estoque">
        <button
          className={tab === "saldos" ? "active" : ""}
          role="tab"
          aria-selected={tab === "saldos"}
          onClick={() => setTab("saldos")}
          type="button"
        >
          Saldos
        </button>
        <button
          className={tab === "movimentos" ? "active" : ""}
          role="tab"
          aria-selected={tab === "movimentos"}
          onClick={() => setTab("movimentos")}
          type="button"
        >
          Movimentações
        </button>
        <button
          className={tab === "inventarios" ? "active" : ""}
          role="tab"
          aria-selected={tab === "inventarios"}
          onClick={() => setTab("inventarios")}
          type="button"
        >
          Inventários
        </button>
      </nav>

      {tab === "saldos" && (
        <BalancesTab balances={balances} depositos={depositos} produtos={produtos} />
      )}
      {tab === "movimentos" && (
        <MovementsTab movements={movements} />
      )}
      {tab === "inventarios" && (
        <InventoriesTab inventories={inventories} depositos={depositos} />
      )}
    </div>
  );
}

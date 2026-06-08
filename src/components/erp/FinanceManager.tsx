"use client";

import { useMemo, useState } from "react";
import type { PayableSummary, ReceivableSummary, BankAccountSummary } from "@/lib/services/finance";

type FormaPagamentoOption = { id: string; nome: string };

type Props = {
  initialPayables: PayableSummary[];
  initialReceivables: ReceivableSummary[];
  bankAccounts: BankAccountSummary[];
  formasPagamento?: FormaPagamentoOption[];
  /** Mostra a ação de EXCLUIR conta a pagar (apenas perfil admin). */
  isAdmin?: boolean;
};

type Aba = "pagar" | "receber";

// Lista fixa usada em contas a receber (recebimento) e como fallback quando não há cadastro.
const FORMAS_FIXAS = [
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "PIX", label: "Pix" },
  { value: "BOLETO", label: "Boleto" },
  { value: "CARTAO_CREDITO", label: "Cartão de Crédito" },
  { value: "CARTAO_DEBITO", label: "Cartão de Débito" },
  { value: "TRANSFERENCIA", label: "Transferência" },
  { value: "CHEQUE", label: "Cheque" }
];

/**
 * Opções de forma de pagamento. Em CONTAS A PAGAR usa o cadastro da empresa (Configurações →
 * Formas de pagamento), gravando o nome. Em contas a receber mantém a lista fixa — o cadastro é
 * do lado de pagamentos, não de recebimentos.
 */
function PaymentMethodOptions({ tipo, formas }: { tipo: Aba; formas: FormaPagamentoOption[] }) {
  if (tipo === "pagar" && formas.length) {
    return <>{formas.map((f) => <option key={f.id} value={f.nome}>{f.nome}</option>)}</>;
  }
  return <>{FORMAS_FIXAS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</>;
}

// ─── Formulário de baixa ──────────────────────────────────────────────────────

type SettleFormProps = {
  tipo: Aba;
  id: string;
  descricao: string;
  saldoNumber: number;
  bankAccounts: BankAccountSummary[];
  formasPagamento: FormaPagamentoOption[];
  onSuccess: (id: string, novoStatus: string) => void;
  onClose: () => void;
};

function SettleForm({ tipo, id, descricao, saldoNumber, bankAccounts, formasPagamento, onSuccess, onClose }: SettleFormProps) {
  const [valor, setValor] = useState(saldoNumber.toFixed(2));
  const [juros, setJuros] = useState("0.00");
  const [multa, setMulta] = useState("0.00");
  const [desconto, setDesconto] = useState("0.00");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [contaBancariaId, setContaBancariaId] = useState(bankAccounts[0]?.id ?? "");
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().substring(0, 10));
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  const endpoint =
    tipo === "pagar"
      ? `/api/erp/financeiro/contas-pagar/${id}/baixar`
      : `/api/erp/financeiro/contas-receber/${id}/baixar`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valor: parseFloat(valor) || 0,
          juros: parseFloat(juros) || 0,
          multa: parseFloat(multa) || 0,
          descontoBaixa: parseFloat(desconto) || 0,
          formaPagamento: formaPagamento || undefined,
          contaBancariaId: contaBancariaId || undefined,
          dataPagamento
        })
      });
      const data = (await res.json()) as { id?: string; status?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao registrar baixa.");
      onSuccess(id, data.status ?? "PAGO");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="drawer-bd" onClick={onClose} />
      <aside className="drawer">
        <header className="drawer-head">
          <h2>{tipo === "pagar" ? "Baixar conta a pagar" : "Baixar conta a receber"}</h2>
          <button type="button" className="btn-erp ghost xs" onClick={onClose}>Fechar</button>
        </header>

        <form onSubmit={handleSubmit} style={{ display: "contents" }}>
          <div className="drawer-body">
            <div style={{ padding: "12px 20px", background: "var(--erp-bg)", borderBottom: "1px solid var(--erp-line)", fontSize: 12, color: "var(--erp-slate)" }}>
              {descricao}
            </div>
            {erro && (
              <div className="alert danger" style={{ margin: "12px 20px 0" }}>
                <span className="lead">Erro:</span>
                <span>{erro}</span>
              </div>
            )}
            <div className="erp-form">
              <label>
                Valor Pago (R$) <span className="required">*</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  required
                />
              </label>
              <label>
                Data Pagamento <span className="required">*</span>
                <input
                  type="date"
                  value={dataPagamento}
                  onChange={(e) => setDataPagamento(e.target.value)}
                  required
                />
              </label>
              <label>
                Juros (R$)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={juros}
                  onChange={(e) => setJuros(e.target.value)}
                />
              </label>
              <label>
                Multa (R$)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={multa}
                  onChange={(e) => setMulta(e.target.value)}
                />
              </label>
              <label>
                Desconto (R$)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={desconto}
                  onChange={(e) => setDesconto(e.target.value)}
                />
              </label>
              <label>
                Forma de Pagamento
                <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
                  <option value="">Selecione...</option>
                  <PaymentMethodOptions tipo={tipo} formas={formasPagamento} />
                </select>
              </label>
              {bankAccounts.length > 0 && (
                <label>
                  Conta Bancária
                  <select value={contaBancariaId} onChange={(e) => setContaBancariaId(e.target.value)}>
                    <option value="">Nenhuma</option>
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nome} ({b.saldoAtual})
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>

          <footer className="drawer-foot">
            <button type="button" className="btn-erp ghost sm" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="btn-erp primary sm" disabled={loading}>
              {loading ? "Registrando…" : "Confirmar baixa"}
            </button>
          </footer>
        </form>
      </aside>
    </>
  );
}

// ─── Formulário nova conta ─────────────────────────────────────────────────────

type NewAccountFormProps = {
  tipo: Aba;
  formasPagamento: FormaPagamentoOption[];
  onSuccess: (item: PayableSummary | ReceivableSummary) => void;
  onClose: () => void;
};

function NewAccountForm({ tipo, formasPagamento, onSuccess, onClose }: NewAccountFormProps) {
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState(new Date().toISOString().substring(0, 10));
  const [formaPagamento, setFormaPagamento] = useState("");
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  const endpoint =
    tipo === "pagar"
      ? "/api/erp/financeiro/contas-pagar"
      : "/api/erp/financeiro/contas-receber";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descricao,
          valor: parseFloat(valor) || 0,
          vencimento,
          formaPagamento: formaPagamento || undefined,
          numeroDocumento: numeroDocumento || undefined,
          observacoes: observacoes || undefined,
          // clienteId placeholder — em produção viria de um seletor de clientes
          ...(tipo === "receber" ? { clienteId: "MANUAL" } : {})
        })
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar conta.");

      // Cria um resumo local para atualizar a lista sem reload
      const novoItem: PayableSummary & ReceivableSummary = {
        id: data.id ?? "",
        descricao,
        parte: "—",
        numeroDocumento: numeroDocumento || "—",
        vencimento: new Date(vencimento + "T12:00:00").toLocaleDateString("pt-BR"),
        vencimentoRaw: vencimento,
        valor: `R$ ${parseFloat(valor).toFixed(2).replace(".", ",")}`,
        valorPago: "R$ 0,00",
        saldo: `R$ ${parseFloat(valor).toFixed(2).replace(".", ",")}`,
        saldoNumber: parseFloat(valor) || 0,
        statusLabel: "Aberto",
        statusTone: "info",
        formaPagamento: formaPagamento || "—",
        canSettle: true,
        canDelete: true
      };
      onSuccess(novoItem);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="drawer-bd" onClick={onClose} />
      <aside className="drawer">
        <header className="drawer-head">
          <h2>{tipo === "pagar" ? "Nova conta a pagar" : "Nova conta a receber"}</h2>
          <button type="button" className="btn-erp ghost xs" onClick={onClose}>Fechar</button>
        </header>

        <form onSubmit={handleSubmit} style={{ display: "contents" }}>
          <div className="drawer-body">
            <div style={{ padding: "12px 20px", background: "var(--erp-bg)", borderBottom: "1px solid var(--erp-line)", fontSize: 12, color: "var(--erp-slate)" }}>
              Cadastre uma conta {tipo === "pagar" ? "a pagar" : "a receber"}.
            </div>
            {erro && (
              <div className="alert danger" style={{ margin: "12px 20px 0" }}>
                <span className="lead">Erro:</span>
                <span>{erro}</span>
              </div>
            )}
            <div className="erp-form">
              <label className="full">
                Descrição <span className="required">*</span>
                <input
                  type="text"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex: Aluguel maio/2026"
                  required
                />
              </label>
              <label>
                Valor (R$) <span className="required">*</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  required
                />
              </label>
              <label>
                Vencimento <span className="required">*</span>
                <input
                  type="date"
                  value={vencimento}
                  onChange={(e) => setVencimento(e.target.value)}
                  required
                />
              </label>
              <label>
                Nº Documento
                <input
                  type="text"
                  value={numeroDocumento}
                  onChange={(e) => setNumeroDocumento(e.target.value)}
                  placeholder="Opcional"
                />
              </label>
              <label>
                Forma de Pagamento
                <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
                  <option value="">Selecione...</option>
                  <PaymentMethodOptions tipo={tipo} formas={formasPagamento} />
                </select>
              </label>
              <label className="full">
                Observações
                <textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows={2}
                  placeholder="Opcional"
                />
              </label>
            </div>
          </div>

          <footer className="drawer-foot">
            <button type="button" className="btn-erp ghost sm" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="btn-erp primary sm" disabled={loading}>
              {loading ? "Salvando…" : "Salvar"}
            </button>
          </footer>
        </form>
      </aside>
    </>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function FinanceManager({ initialPayables, initialReceivables, bankAccounts, formasPagamento = [], isAdmin = false }: Props) {
  const [aba, setAba] = useState<Aba>("pagar");
  const [payables, setPayables] = useState(initialPayables);
  const [receivables, setReceivables] = useState(initialReceivables);
  const [query, setQuery] = useState("");
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function excluirPagar(id: string, descricao: string) {
    if (!window.confirm(`Excluir a conta a pagar "${descricao}"? Esta ação não pode ser desfeita.`)) return;
    setBusyId(id);
    setGlobalError("");
    try {
      const res = await fetch(`/api/erp/financeiro/contas-pagar/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível excluir a conta.");
      setPayables((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : "Falha ao excluir conta a pagar.");
    } finally {
      setBusyId(null);
    }
  }

  const rows = aba === "pagar" ? payables : receivables;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.descricao, r.parte, r.numeroDocumento, r.statusLabel, r.vencimento].some((f) =>
        f.toLowerCase().includes(q)
      )
    );
  }, [rows, query]);

  const settlingItem = settlingId ? rows.find((r) => r.id === settlingId) : null;

  function handleSettleSuccess(id: string, novoStatus: string) {
    function updateRow<T extends PayableSummary | ReceivableSummary>(items: T[]): T[] {
      return items.map((r) => {
        if (r.id !== id) return r;
        const pago = novoStatus === "PAGO";
        return {
          ...r,
          statusLabel: pago ? "Pago" : "Parcial",
          statusTone: pago ? ("success" as const) : ("warn" as const),
          canSettle: !pago,
          valorPago: pago ? r.valor : r.valorPago,
          saldo: pago ? "R$ 0,00" : r.saldo,
          saldoNumber: pago ? 0 : r.saldoNumber
        };
      });
    }
    if (aba === "pagar") setPayables((prev) => updateRow(prev));
    else setReceivables((prev) => updateRow(prev));
    setSettlingId(null);
  }

  function handleNewSuccess(item: PayableSummary | ReceivableSummary) {
    if (aba === "pagar") setPayables((prev) => [item as PayableSummary, ...prev]);
    else setReceivables((prev) => [item as ReceivableSummary, ...prev]);
    setShowNewForm(false);
  }

  return (
    <>
      {/* Abas */}
      <nav className="tabs" style={{ padding: 0, background: "#fff", border: "1px solid var(--erp-line)", borderBottom: 0, borderRadius: "8px 8px 0 0" }}>
        <button
          className={aba === "pagar" ? "active" : ""}
          type="button"
          onClick={() => { setAba("pagar"); setQuery(""); }}
        >
          Contas a pagar <span className="pill mute" style={{ marginLeft: 6, fontSize: 9 }}>{payables.length}</span>
        </button>
        <button
          className={aba === "receber" ? "active" : ""}
          type="button"
          onClick={() => { setAba("receber"); setQuery(""); }}
        >
          Contas a receber <span className="pill mute" style={{ marginLeft: 6, fontSize: 9 }}>{receivables.length}</span>
        </button>
      </nav>

      {/* Toolbar */}
      <div className="erp-toolbar" style={{ borderTop: 0, borderRadius: 0 }}>
        <div className="toolbar-search">
          <span className="ic-sr" aria-hidden="true">⌕</span>
          <input
            className="search"
            placeholder="Buscar por descrição, parte, nº documento…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="grow" />
        <button
          type="button"
          className="btn-erp primary sm"
          onClick={() => { setGlobalError(""); setShowNewForm(true); }}
        >
          + Nova conta
        </button>
      </div>

      {globalError && (
        <div className="alert danger">
          <strong>Erro</strong>
          <span>{globalError}</span>
        </div>
      )}

      {/* Tabela */}
      <div className="erp-table-wrap" style={{ borderRadius: "0 0 8px 8px", borderTop: 0 }}>
        <table className="erp-table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>{aba === "pagar" ? "Fornecedor" : "Cliente"}</th>
              <th>Nº Documento</th>
              <th>Vencimento</th>
              <th className="num">Valor</th>
              <th className="num">Pago</th>
              <th className="num">Saldo</th>
              <th>Situação</th>
              <th className="actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.descricao}</strong>
                  {r.formaPagamento !== "—" && (
                    <span className="sublabel">{r.formaPagamento}</span>
                  )}
                </td>
                <td>{r.parte}</td>
                <td><span className="mono">{r.numeroDocumento}</span></td>
                <td>{r.vencimento}</td>
                <td className="num">{r.valor}</td>
                <td className="num">{r.valorPago}</td>
                <td className="num">
                  <strong>{r.saldo}</strong>
                </td>
                <td>
                  <span className={`pill ${r.statusTone}`}>
                    <span className="dot" />
                    {r.statusLabel}
                  </span>
                </td>
                <td className="actions">
                  {r.canSettle && (
                    <button
                      type="button"
                      className="btn-erp primary xs"
                      onClick={() => { setGlobalError(""); setSettlingId(r.id); }}
                    >
                      Baixar
                    </button>
                  )}
                  <button type="button" className="btn-erp ghost xs">Boleto</button>
                  {isAdmin && aba === "pagar" && (r as PayableSummary).canDelete && (
                    <button
                      type="button"
                      className="btn-erp danger xs"
                      title="Excluir conta a pagar (admin)"
                      disabled={busyId === r.id}
                      onClick={() => excluirPagar(r.id, r.descricao)}
                    >
                      {busyId === r.id ? "..." : "Excluir"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={9}>
                  <div className="empty-st">
                    <h4>{query ? "Nenhum resultado" : aba === "pagar" ? "Nenhuma conta a pagar" : "Nenhuma conta a receber"}</h4>
                    <p>
                      {query
                        ? "Nenhum resultado para a busca atual."
                        : aba === "pagar"
                        ? "Nenhuma conta a pagar cadastrada."
                        : "Nenhuma conta a receber cadastrada."}
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {filtered.length > 0 && (
          <div className="erp-table-foot">
            <span>{filtered.length} conta(s)</span>
            <div className="pagi">
              <button type="button" className="active">1</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de baixa */}
      {settlingId && settlingItem && (
        <SettleForm
          tipo={aba}
          id={settlingId}
          descricao={settlingItem.descricao}
          saldoNumber={settlingItem.saldoNumber}
          bankAccounts={bankAccounts}
          formasPagamento={formasPagamento}
          onSuccess={handleSettleSuccess}
          onClose={() => setSettlingId(null)}
        />
      )}

      {/* Modal nova conta */}
      {showNewForm && (
        <NewAccountForm
          tipo={aba}
          formasPagamento={formasPagamento}
          onSuccess={handleNewSuccess}
          onClose={() => setShowNewForm(false)}
        />
      )}
    </>
  );
}

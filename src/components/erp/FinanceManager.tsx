"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/shared/Button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { PayableSummary, ReceivableSummary, BankAccountSummary } from "@/lib/services/finance";

type Props = {
  initialPayables: PayableSummary[];
  initialReceivables: ReceivableSummary[];
  bankAccounts: BankAccountSummary[];
};

type Aba = "pagar" | "receber";

// ─── Formulário de baixa ──────────────────────────────────────────────────────

type SettleFormProps = {
  tipo: Aba;
  id: string;
  descricao: string;
  saldoNumber: number;
  bankAccounts: BankAccountSummary[];
  onSuccess: (id: string, novoStatus: string) => void;
  onClose: () => void;
};

function SettleForm({ tipo, id, descricao, saldoNumber, bankAccounts, onSuccess, onClose }: SettleFormProps) {
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
    <div className="op-modal-overlay">
      <div className="op-modal">
        <h2 className="op-modal-title">
          {tipo === "pagar" ? "Baixar Conta a Pagar" : "Baixar Conta a Receber"}
        </h2>
        <p className="op-modal-subtitle">{descricao}</p>

        {erro && (
          <div className="alert danger">
            <strong>Erro</strong>
            <span>{erro}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="op-form">
          <div className="op-form-row">
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
          </div>

          <div className="op-form-row">
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
          </div>

          <div className="op-form-row">
            <label>
              Forma de Pagamento
              <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
                <option value="">Selecione...</option>
                <option value="DINHEIRO">Dinheiro</option>
                <option value="PIX">Pix</option>
                <option value="BOLETO">Boleto</option>
                <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                <option value="CARTAO_DEBITO">Cartão de Débito</option>
                <option value="TRANSFERENCIA">Transferência</option>
                <option value="CHEQUE">Cheque</option>
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

          <div className="op-form-actions">
            <Button type="button" variant="light" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? "Registrando..." : "Confirmar Baixa"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Formulário nova conta ─────────────────────────────────────────────────────

type NewAccountFormProps = {
  tipo: Aba;
  onSuccess: (item: PayableSummary | ReceivableSummary) => void;
  onClose: () => void;
};

function NewAccountForm({ tipo, onSuccess, onClose }: NewAccountFormProps) {
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
        canSettle: true
      };
      onSuccess(novoItem);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="op-modal-overlay">
      <div className="op-modal">
        <h2 className="op-modal-title">
          {tipo === "pagar" ? "Nova Conta a Pagar" : "Nova Conta a Receber"}
        </h2>

        {erro && (
          <div className="alert danger">
            <strong>Erro</strong>
            <span>{erro}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="op-form">
          <label>
            Descrição <span className="required">*</span>
            <input
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Aluguel maio/2026"
              required
            />
          </label>

          <div className="op-form-row">
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
          </div>

          <div className="op-form-row">
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
                <option value="DINHEIRO">Dinheiro</option>
                <option value="PIX">Pix</option>
                <option value="BOLETO">Boleto</option>
                <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                <option value="CARTAO_DEBITO">Cartão de Débito</option>
                <option value="TRANSFERENCIA">Transferência</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </label>
          </div>

          <label>
            Observações
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              placeholder="Opcional"
            />
          </label>

          <div className="op-form-actions">
            <Button type="button" variant="light" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function FinanceManager({ initialPayables, initialReceivables, bankAccounts }: Props) {
  const [aba, setAba] = useState<Aba>("pagar");
  const [payables, setPayables] = useState(initialPayables);
  const [receivables, setReceivables] = useState(initialReceivables);
  const [query, setQuery] = useState("");
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [globalError, setGlobalError] = useState("");

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
    <section className="op-list">
      {/* Abas */}
      <div className="op-tabs">
        <button
          className={`op-tab${aba === "pagar" ? " active" : ""}`}
          type="button"
          onClick={() => { setAba("pagar"); setQuery(""); }}
        >
          A Pagar
        </button>
        <button
          className={`op-tab${aba === "receber" ? " active" : ""}`}
          type="button"
          onClick={() => { setAba("receber"); setQuery(""); }}
        >
          A Receber
        </button>
      </div>

      {/* Toolbar */}
      <div className="op-toolbar">
        <div className="op-search">
          <span aria-hidden="true">⌕</span>
          <input
            placeholder="Buscar por descrição, parte, nº documento..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="toolbar-grow" />
        <Button
          variant="primary"
          type="button"
          onClick={() => { setGlobalError(""); setShowNewForm(true); }}
        >
          + Nova conta
        </Button>
      </div>

      {globalError && (
        <div className="alert danger">
          <strong>Erro</strong>
          <span>{globalError}</span>
        </div>
      )}

      {/* Tabela */}
      <div className="erp-table-wrap">
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
                    <small className="block-muted">{r.formaPagamento}</small>
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
                  <StatusBadge tone={r.statusTone}>{r.statusLabel}</StatusBadge>
                </td>
                <td className="actions">
                  {r.canSettle && (
                    <button
                      className="link-btn"
                      type="button"
                      onClick={() => { setGlobalError(""); setSettlingId(r.id); }}
                    >
                      Baixar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={9}>
                  <div className="empty-st">
                    {query
                      ? "Nenhum resultado para a busca."
                      : aba === "pagar"
                      ? "Nenhuma conta a pagar cadastrada."
                      : "Nenhuma conta a receber cadastrada."}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de baixa */}
      {settlingId && settlingItem && (
        <SettleForm
          tipo={aba}
          id={settlingId}
          descricao={settlingItem.descricao}
          saldoNumber={settlingItem.saldoNumber}
          bankAccounts={bankAccounts}
          onSuccess={handleSettleSuccess}
          onClose={() => setSettlingId(null)}
        />
      )}

      {/* Modal nova conta */}
      {showNewForm && (
        <NewAccountForm
          tipo={aba}
          onSuccess={handleNewSuccess}
          onClose={() => setShowNewForm(false)}
        />
      )}
    </section>
  );
}
